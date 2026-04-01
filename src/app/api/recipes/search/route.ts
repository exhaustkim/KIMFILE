import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// BGE-M3 임베딩 생성 — Python 사이드카 대신 Supabase Edge Function 또는
// 여기서는 간단히 재료 키워드 기반 GIN 검색으로 베타 구현
// (실제 벡터 검색은 Edge Function에서 BGE-M3 호출 후 RPC)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const category = searchParams.get('category')?.trim()
  const limit = Math.min(Number(searchParams.get('limit') ?? '12'), 50)

  if (!query && !category) {
    return NextResponse.json({ error: 'query 또는 category가 필요합니다' }, { status: 400 })
  }

  const supabase = await createClient()

  let dbQuery = supabase
    .from('recipes')
    .select('id, name, category, cooking_method, ingredient_names, steps, hash_tags')
    .limit(limit)

  // 카테고리 필터
  if (category) {
    dbQuery = dbQuery.eq('category', category)
  }

  // 재료명 키워드 검색 (GIN 인덱스 활용)
  if (query) {
    const keywords = query.split(/[\s,]+/).filter(Boolean)
    // 재료명 배열에 키워드가 하나라도 포함되는 레시피 검색
    dbQuery = dbQuery.overlaps('ingredient_names', keywords)
  }

  const { data, error } = await dbQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data ?? [], count: data?.length ?? 0 })
}
