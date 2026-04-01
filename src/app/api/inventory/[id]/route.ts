import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/inventory/[id]
// 재고 수정 (수량, 소비기한, 보관위치 등)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  // 허용 필드만 추출 (user_id, added_by 등 민감 필드 제외)
  const allowed = [
    'ingredient_name', 'quantity', 'unit',
    'purchase_date', 'expiry_date', 'expiry_source',
    'storage_location',
  ] as const

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('inventory')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)   // RLS 이중 검증
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })

  return NextResponse.json({ item: data })
}

// DELETE /api/inventory/[id]
// 재고 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { id } = await params

  const { error } = await supabase
    .from('inventory')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
