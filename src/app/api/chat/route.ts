import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { CohereClient } from 'cohere-ai'
import { GoogleGenerativeAI } from '@google/generative-ai'

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! })
const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY ?? '').trim())

type UserLevel = 'beginner' | 'intermediate' | 'advanced'
type Role = 'user' | 'model'

interface Message {
  role: Role
  content: string
}

const LEVEL_LABELS: Record<UserLevel, string> = {
  beginner:     '초보',
  intermediate: '중급',
  advanced:     '고급',
}

const LEVEL_INSTRUCTIONS: Record<UserLevel, string> = {
  beginner: `
- 사용 재료를 최소화하여 핵심 재료만 설명
- 복잡한 식기구(오븐, 믹서기 등) 없이 냄비·프라이팬으로만 설명
- 조리 단계를 3~5단계로 단순화
- 어려운 요리 용어는 쉬운 말로 풀어서 설명`,
  intermediate: `
- 일반적인 레시피 수준으로 설명
- 다양한 재료와 조리법 포함 가능`,
  advanced: `
- 세부 조리 기법, 재료 대체 옵션, 플레이팅 등 상세히 설명
- 전문 용어 사용 가능`,
}

function buildSystemPrompt(
  level: UserLevel,
  inventoryNames: string[],
  expiringItems: string[],
): string {
  const inventorySection = inventoryNames.length > 0
    ? `\n\n## 사용자가 현재 보유한 재료\n${inventoryNames.join(', ')}\n- 반드시 이 재료들로 만들 수 있는 레시피를 우선 추천할 것\n- 보유하지 않은 재료가 많이 필요한 레시피는 추천하지 말 것`
    : '\n\n## 사용자 재고 정보 없음\n- 재고가 등록되지 않았으므로 일반적인 레시피를 추천할 것'

  const expiringSection = expiringItems.length > 0
    ? `\n\n## 소비기한 임박 재료 (최우선 활용)\n${expiringItems.join(', ')}\n- 위 재료를 반드시 활용하는 레시피를 가장 먼저 추천할 것`
    : ''

  return `당신은 냉장고 탐정 서비스의 요리 도우미입니다.
사용자 수준: ${LEVEL_LABELS[level]}

## 사용자 수준별 응답 지침${LEVEL_INSTRUCTIONS[level]}

## 응답 규칙
- 레시피가 DB에 있으면 해당 레시피를 기반으로 답변
- 없으면 YouTube 검색 링크 제공 (https://www.youtube.com/results?search_query=검색어)
- 한국어로 친근하게 답변
- 답변은 명확하고 실용적으로${inventorySection}${expiringSection}`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { message, user_level = 'beginner', history = [] } = await request.json() as {
    message: string
    user_level: UserLevel
    history: Message[]
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: '메시지를 입력해주세요' }, { status: 400 })
  }

  // 1. 재고 전체 + 소비기한 임박 재료 병렬 조회
  const threeDaysLater = new Date()
  threeDaysLater.setDate(threeDaysLater.getDate() + 3)

  const [{ data: inventoryItems }, { data: expiringItems }] = await Promise.all([
    supabase
      .from('inventory')
      .select('ingredient_name')
      .eq('user_id', user.id)
      .eq('is_consumed', false),
    supabase
      .from('inventory')
      .select('ingredient_name, expiry_date')
      .eq('user_id', user.id)
      .eq('is_consumed', false)
      .lte('expiry_date', threeDaysLater.toISOString().split('T')[0])
      .order('expiry_date', { ascending: true }),
  ])

  const inventoryNames = (inventoryItems ?? []).map(i => i.ingredient_name)
  const expiringNames  = (expiringItems ?? []).map(
    i => `${i.ingredient_name}(D-${Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000)})`
  )

  // 2. Cohere 임베딩: 유저 메시지 + 보유 재료명 결합 → 재고 기반 검색 강화
  const searchText = inventoryNames.length > 0
    ? `${message} ${inventoryNames.join(' ')}`
    : message

  const embedResp = await cohere.embed({
    texts: [searchText],
    model: 'embed-multilingual-v3.0',
    inputType: 'search_query',
  })
  const queryEmbedding = (embedResp.embeddings as number[][])[0]

  // 3. pgvector 시맨틱 검색
  const { data: recipes } = await supabase.rpc('search_recipes_by_embedding', {
    query_embedding: queryEmbedding,
    match_threshold: 0.3,
    match_count: 5,
  })

  // 4. 컨텍스트 구성
  let recipeContext = ''
  let youtubeQuery = ''

  if (recipes && recipes.length > 0) {
    recipeContext = recipes
      .map((r: {
        name: string
        cooking_method: string
        cooking_level: string
        cook_time_minutes: number | null
        ingredient_names: string[]
        steps: { step: number; description: string }[]
        similarity: number
      }) => {
        const meta = [r.cooking_method, r.cooking_level, r.cook_time_minutes ? `${r.cook_time_minutes}분` : null]
          .filter(Boolean).join(' / ')
        return (
          `[레시피] ${r.name} (${meta})\n` +
          `재료: ${(r.ingredient_names ?? []).join(', ')}\n` +
          `조리법: ${(r.steps ?? []).slice(0, 3).map((s) => s.description).join(' → ')}`
        )
      })
      .join('\n\n')
  } else {
    // DB에 없을 때 → YouTube 검색 쿼리 생성
    youtubeQuery = encodeURIComponent(`${message} 레시피 만들기`)
  }

  // 5. Gemini 호출
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    systemInstruction: buildSystemPrompt(user_level, inventoryNames, expiringNames),
  })

  const chat = model.startChat({
    history: history.map(m => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
  })

  const userMessage = recipeContext
    ? `${message}\n\n참고 레시피:\n${recipeContext}`
    : youtubeQuery
    ? `${message}\n\n(DB에 관련 레시피가 없습니다. YouTube 검색 링크를 제공해주세요: https://www.youtube.com/results?search_query=${youtubeQuery})`
    : message

  const result = await chat.sendMessage(userMessage)
  const reply = result.response.text()

  return NextResponse.json({
    reply,
    referenced_recipes: recipes ?? [],
    expiring_items: expiringItems ?? [],
    source: recipes?.length > 0 ? 'db' : 'youtube',
  })
}
