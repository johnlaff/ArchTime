import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const cookieStore = await cookies()
  let authHeaders: Record<string, string> = {}

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, headers) {
          authHeaders = { ...authHeaders, ...headers }
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // Troca o code PKCE por sessão — email só é confiado após essa troca
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  // Se o exchange falhou, verifica se a sessão já existe (race condition do PKCE:
  // o mesmo code pode chegar duas vezes; o segundo retorna error mas os cookies
  // já foram gravados pelo primeiro).
  let user = data?.session?.user ?? null

  if (!user) {
    if (error) {
      const { data: { user: existingUser } } = await supabase.auth.getUser()
      user = existingUser ?? null
    }
    if (!user) {
      const response = NextResponse.redirect(`${origin}/login?error=exchange_failed`)
      Object.entries(authHeaders).forEach(([key, value]) => response.headers.set(key, value))
      return response
    }
  }

  // Verifica email permitido DEPOIS da troca — nunca antes
  if (!isAllowedEmail(user!.email)) {
    await supabase.auth.signOut()
    const response = NextResponse.redirect(`${origin}/login?error=unauthorized`)
    Object.entries(authHeaders).forEach(([key, value]) => response.headers.set(key, value))
    return response
  }

  // Sincroniza usuário na base de dados (email garantido não-nulo pela guarda acima)
  const email = user!.email!
  await prisma.user.upsert({
    where: { email },
    update: {
      name: user!.user_metadata?.full_name ?? null,
      avatarUrl: user!.user_metadata?.avatar_url ?? null,
    },
    create: {
      id: user!.id,
      email,
      name: user!.user_metadata?.full_name ?? null,
      avatarUrl: user!.user_metadata?.avatar_url ?? null,
    },
  })

  const response = NextResponse.redirect(`${origin}/dashboard`)
  Object.entries(authHeaders).forEach(([key, value]) => response.headers.set(key, value))
  return response
}
