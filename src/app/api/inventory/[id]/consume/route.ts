import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/inventory/[id]/consume
// 식재료 소비 처리 (재고에서 제거하지 않고 is_consumed=true로 soft delete)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('inventory')
    .update({
      is_consumed: true,
      consumed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_consumed', false)  // 이미 소비된 항목 중복 처리 방지
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })

  return NextResponse.json({ item: data })
}
