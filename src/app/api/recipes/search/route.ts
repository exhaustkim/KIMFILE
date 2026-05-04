import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// recipes_10000 기반 GIN 키워드 검색
// 재료명 배열(ingredient_names)의 GIN 인덱스 활용

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const level = searchParams.get('level')?.trim()      // 초보 | 중급 | 고급
  const category = searchParams.get('category')?.trim() // 식사 | 반찬 | 간식 | 음료
  const limit = Math.min(Number(searchParams.get('limit') ?? '12'), 50)

  if (!query) {
    return NextResponse.json({ error: 'query(q)가 필요합니다' }, { status: 400 })
  }

  const supabase = await createClient()

  let dbQuery = supabase
    .from('recipes_10000')
    .select('id, name, cooking_method, cooking_level, category, cook_time_minutes, ingredient_names, steps, image_url')
    .limit(limit)

  if (level) dbQuery = dbQuery.eq('cooking_level', level)
  if (category) dbQuery = dbQuery.eq('category', category)

  // 재료명 키워드 검색 (GIN 인덱스 활용)
  if (query) {
    const keywords = query.split(/[\s,]+/).filter(Boolean)
    dbQuery = dbQuery.overlaps('ingredient_names', keywords)
  }

  const { data, error } = await dbQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data ?? [], count: data?.length ?? 0 })
}
