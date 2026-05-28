import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedEmail } from '@/lib/auth'
import {
  getSupabaseAuthCookieNames,
  isStaleRefreshTokenError,
} from '@/lib/server/supabase-session'

function redirectToLogin(request: NextRequest, error?: string) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  if (error) url.searchParams.set('error', error)
  const response = NextResponse.redirect(url)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

function expireAuthCookies(response: NextResponse, cookieNames: string[]) {
  cookieNames.forEach((name) => {
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  })
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const authCookieNames = getSupabaseAuthCookieNames(request.cookies.getAll())

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Local JWT verification (cached JWKS, no Auth-server round-trip) — the
  // project uses asymmetric signing keys. The createServerClient cookie
  // handlers above still refresh expiring tokens through getClaims.
  let data: Awaited<ReturnType<typeof supabase.auth.getClaims>>['data'] | null = null
  let authError: unknown = null

  try {
    const result = await supabase.auth.getClaims()
    data = result.data
    authError = result.error
  } catch (error) {
    authError = error
  }

  if (authError) {
    const response = redirectToLogin(
      request,
      isStaleRefreshTokenError(authError) ? 'session_expired' : 'auth_failed'
    )
    if (isStaleRefreshTokenError(authError)) expireAuthCookies(response, authCookieNames)
    return response
  }

  const claims = data?.claims

  if (!claims || !isAllowedEmail(claims.email)) {
    const response = redirectToLogin(request)
    if (authCookieNames.length > 0) expireAuthCookies(response, authCookieNames)
    return response
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    {
      source:
        '/((?!login|auth/callback|_next/static|_next/image|icons|api/icon|manifest\\.json|sw\\.js|favicon\\.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
