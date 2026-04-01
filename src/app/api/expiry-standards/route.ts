import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/expiry-standards?name=달걀&location=냉장
// 식재료명 + 보관위치로 소비기한 기준일 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const name     = searchParams.get('name')?.trim()
  const location = searchParams.get('location')?.trim()

  if (!name) {
    return NextResponse.json({ error: 'name 파라미터가 필요합니다' }, { status: 400 })
  }

  let query = supabase
    .from('expiry_standards')
    .select('*')
    .eq('ingredient_name', name)

  if (location) query = query.eq('storage_location', location)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ standards: data ?? [] })
}
