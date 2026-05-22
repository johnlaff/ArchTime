import type { Page } from '@playwright/test'

export async function injectSupabaseSession(page: Page): Promise<void> {
  const session = process.env.SUPABASE_TEST_SESSION
  if (!session) {
    throw new Error(
      'SUPABASE_TEST_SESSION não definido em .env.local.\n' +
      'Faça login no app, abra DevTools → Application → Local Storage,\n' +
      'copie o valor da chave que começa com "sb-" e termine em "-auth-token",\n' +
      'e cole em .env.local como SUPABASE_TEST_SESSION=<valor>'
    )
  }
  await page.goto('/')
  await page.evaluate((s) => {
    const existingKey = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    )
    if (existingKey) {
      localStorage.setItem(existingKey, s)
    } else {
      try {
        const parsed = JSON.parse(s)
        const ref = parsed?.user?.aud ?? 'authenticated'
        localStorage.setItem(`sb-${ref}-auth-token`, s)
      } catch {
        throw new Error('Não foi possível determinar a chave do Supabase. Verifique SUPABASE_TEST_SESSION.')
      }
    }
  }, session)
}
