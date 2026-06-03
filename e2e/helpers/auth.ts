import type { Page } from '@playwright/test'

export async function injectSupabaseSession(page: Page): Promise<void> {
  const session = process.env.SUPABASE_TEST_SESSION
  if (!session) {
    // Auth agora vem do storageState gerado por auth.setup.ts (cookie-based SSR).
    // Mantido como no-op para compatibilidade com specs que ainda chamam isto.
    return
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
