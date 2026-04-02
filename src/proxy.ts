import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// 로그인 없이 접근 가능한 경로
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/recipes/search',
  '/api/recipes/semantic-search',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // Supabase 세션 쿠키 갱신
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 보호된 API에 비로그인 접근 → 401
  if (!isPublic && pathname.startsWith('/api/') && !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
