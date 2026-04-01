import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/inventory/bulk
// OCR/이미지 인식 결과를 한 번에 여러 건 추가 (영수증 스캔 후 확정 시 사용)
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const body = await request.json()
  const { items } = body  // InventoryItem[]

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items 배열이 필요합니다' }, { status: 400 })
  }
  if (items.length > 50) {
    return NextResponse.json({ error: '한 번에 최대 50개까지 추가할 수 있습니다' }, { status: 400 })
  }

  // 소비기한 미입력 항목에 기준표 자동 적용
  const { data: standards } = await supabase
    .from('expiry_standards')
    .select('ingredient_name, storage_location, days_from_purchase')

  const standardMap = new Map(
    (standards ?? []).map(s => [`${s.ingredient_name}__${s.storage_location}`, s.days_from_purchase])
  )

  const records = items.map((item: Record<string, unknown>) => {
    const storageLocation = (item.storage_location as string) ?? '냉장'
    let expiryDate = (item.expiry_date as string) ?? null
    let expirySource = (item.expiry_source as string) ?? 'user'

    if (!expiryDate && item.purchase_date) {
      const key = `${item.ingredient_name}__${storageLocation}`
      const days = standardMap.get(key)
      if (days) {
        const base = new Date(item.purchase_date as string)
        base.setDate(base.getDate() + days)
        expiryDate = base.toISOString().split('T')[0]
        expirySource = 'standard'
      }
    }

    return {
      user_id: user.id,
      ingredient_name: item.ingredient_name as string,
      quantity: (item.quantity as number) ?? null,
      unit: (item.unit as string) ?? null,
      purchase_date: (item.purchase_date as string) ?? null,
      expiry_date: expiryDate,
      expiry_source: expirySource,
      storage_location: storageLocation,
      added_by: (item.added_by as string) ?? 'ocr',
    }
  })

  const { data, error } = await supabase
    .from('inventory')
    .insert(records)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data, count: data.length }, { status: 201 })
}
