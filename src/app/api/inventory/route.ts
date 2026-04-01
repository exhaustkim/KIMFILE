import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/inventory
// 현재 로그인 사용자의 재고 목록 (소비기한 임박 순)
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const location = searchParams.get('location')   // 냉장 | 냉동 | 실온
  const expiring  = searchParams.get('expiring')  // 'true' → D-3 이내만

  let query = supabase
    .from('inventory')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_consumed', false)
    .order('expiry_date', { ascending: true, nullsFirst: false })

  if (location) query = query.eq('storage_location', location)

  if (expiring === 'true') {
    const threeDaysLater = new Date()
    threeDaysLater.setDate(threeDaysLater.getDate() + 3)
    query = query.lte('expiry_date', threeDaysLater.toISOString().split('T')[0])
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inventory: data })
}

// POST /api/inventory
// 재고 추가 (수동 입력 또는 OCR 결과)
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const body = await request.json()
  const {
    ingredient_name,
    quantity,
    unit,
    purchase_date,
    expiry_date,
    expiry_source,
    storage_location = '냉장',
    added_by = 'manual',
  } = body

  if (!ingredient_name) {
    return NextResponse.json({ error: 'ingredient_name은 필수입니다' }, { status: 400 })
  }

  // 소비기한 미입력 시 기준표에서 자동 조회
  let resolvedExpiryDate = expiry_date ?? null
  let resolvedExpirySource = expiry_source ?? 'user'

  if (!resolvedExpiryDate && purchase_date) {
    const { data: standard } = await supabase
      .from('expiry_standards')
      .select('days_from_purchase')
      .eq('ingredient_name', ingredient_name)
      .eq('storage_location', storage_location)
      .maybeSingle()

    if (standard) {
      const base = new Date(purchase_date)
      base.setDate(base.getDate() + standard.days_from_purchase)
      resolvedExpiryDate = base.toISOString().split('T')[0]
      resolvedExpirySource = 'standard'
    }
  }

  const { data, error } = await supabase
    .from('inventory')
    .insert({
      user_id: user.id,
      ingredient_name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      purchase_date: purchase_date ?? null,
      expiry_date: resolvedExpiryDate,
      expiry_source: resolvedExpirySource,
      storage_location,
      added_by,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data }, { status: 201 })
}
