import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY ?? '').trim())

const PROMPT = `이 영수증 이미지를 분석해서 식재료(음식 재료)만 추출해줘.

규칙:
- 식재료(채소, 육류, 해산물, 유제품, 조미료, 과일, 곡류 등)만 포함
- 비닐봉투, 영수증 번호, 매장명, 날짜, 가격, 합계, 할인, 포인트 등은 제외
- 수량/단위(300g, 1개 등)는 제거하고 이름만 추출
- 중복 제거

반드시 아래 JSON 형식으로만 응답해. 다른 텍스트 없이 JSON만:
{"ingredients": ["재료명1", "재료명2", ...]}`

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart/form-data 형식으로 전송해 주세요' }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file 필드가 없습니다' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '이미지는 10MB 이하여야 합니다' }, { status: 413 })
  }

  // 이미지 → base64
  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  // Gemini 지원 형식으로 정규화
  const rawType = file.type || 'image/jpeg'
  const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  const mimeType = SUPPORTED.includes(rawType) ? rawType : 'image/jpeg'

  try {
    const keyPreview = (process.env.GEMINI_API_KEY ?? '').trim().slice(0, 8)
    console.log('[OCR] GEMINI_API_KEY 앞 8자:', keyPreview, '길이:', (process.env.GEMINI_API_KEY ?? '').length)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: base64, mimeType } },
    ])

    const text = result.response.text().trim()
    console.log('[OCR] Gemini 응답:', text.slice(0, 200))

    // JSON 추출 (마크다운 코드블록 또는 일반 텍스트 처리)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[OCR] JSON 없음. 응답:', text)
      return NextResponse.json({ error: '식재료를 인식하지 못했습니다' }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    const names: string[] = (parsed.ingredients ?? []).filter((n: unknown) => typeof n === 'string' && n.trim())

    return NextResponse.json({
      ingredients: names.map(name => ({ text: name.trim(), confidence: 1.0 })),
      raw_texts: names,
      image_size: [0, 0],
    })
  } catch (err) {
    console.error('[OCR] Gemini Vision 오류:', err)
    return NextResponse.json({ error: '이미지 분석에 실패했습니다' }, { status: 500 })
  }
}
