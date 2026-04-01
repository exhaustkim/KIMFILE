import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: '인증되지 않은 사용자입니다' }, { status: 401 })
  }

  return NextResponse.json({ user })
}
