import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// 벡터 시맨틱 검색 — 쿼리 임베딩은 클라이언트에서 받거나
// 추후 Supabase Edge Function으로 BGE-M3 호출
// 현재 베타: 클라이언트가 embedding 배열을 POST로 전송

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { embedding, threshold = 0.5, limit = 10 } = body

  if (!embedding || !Array.isArray(embedding)) {
    return NextResponse.json({ error: 'embedding 배열이 필요합니다' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('search_recipes_by_embedding', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: Math.min(limit, 20),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data ?? [] })
}
