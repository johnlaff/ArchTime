import { test as setup, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Authenticated E2E without a manually-copied token: mint a real session for the
// allowed user via the service-role key (admin magic-link → verifyOtp), serialize
// it into @supabase/ssr cookies, then save Playwright storageState. Run with the
// env file: `npx playwright test --env-file=.env.local`.
//
// Uses the REAL allowed email on purpose — it has clock history, so the heatmap and
// insights render with actual data (you can't evaluate them on an empty account).

export const STORAGE_STATE = 'e2e/.auth/user.json'

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} ausente. Rode com: npx playwright test --env-file=.env.local`)
  }
  return value
}

async function mintSession() {
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const email = env('ALLOWED_EMAILS').split(',')[0].trim()

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !link?.properties) {
    throw new Error(`generateLink falhou para ${email}: ${linkError?.message ?? 'sem properties'}`)
  }

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // hashed_token (magiclink) primeiro; email_otp (email) como fallback entre versões.
  let session = null
  const byHash = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  session = byHash.data?.session ?? null
  if (!session && link.properties.email_otp) {
    const byOtp = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: 'email' })
    if (byOtp.error) throw new Error(`verifyOtp falhou: ${byOtp.error.message}`)
    session = byOtp.data?.session ?? null
  }
  if (!session) throw new Error('Não foi possível obter a sessão a partir do magic link')

  return { url, anonKey, email, session }
}

/** Serialize a session into the exact @supabase/ssr cookie(s) via the lib's own writer. */
async function supabaseSessionCookies(url: string, anonKey: string, session: { access_token: string; refresh_token: string }) {
  const jar: Array<{ name: string; value: string }> = []
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        for (const c of cookies) jar.push({ name: c.name, value: c.value })
      },
    },
  })
  await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })

  if (jar.length === 0) {
    // Fallback: hand-encode (@supabase/ssr 0.10 format), chunked at ~3180 bytes.
    const ref = new URL(url).hostname.split('.')[0]
    const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64')}`
    const CHUNK = 3180
    if (value.length <= CHUNK) {
      jar.push({ name: `sb-${ref}-auth-token`, value })
    } else {
      for (let i = 0, idx = 0; i < value.length; i += CHUNK, idx++) {
        jar.push({ name: `sb-${ref}-auth-token.${idx}`, value: value.slice(i, i + CHUNK) })
      }
    }
  }

  return jar.map((c) => ({
    name: c.name,
    value: c.value,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
    expires: -1,
  }))
}

setup('authenticate', async ({ page, context }) => {
  const { url, anonKey, session } = await mintSession()
  const cookies = await supabaseSessionCookies(url, anonKey, session)
  expect(cookies.length, 'nenhum cookie de sessão gerado').toBeGreaterThan(0)
  await context.addCookies(cookies)

  // GATE: a rota protegida carrega de fato (não redireciona ao /login).
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 20_000 })

  mkdirSync(dirname(STORAGE_STATE), { recursive: true })
  await context.storageState({ path: STORAGE_STATE })
})
