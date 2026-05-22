import { test, expect } from '@playwright/test'
import { injectSupabaseSession } from './helpers/auth'

const ROUTES = [
  { from: '/dashboard',     to: '/historico',     label: 'Ponto → Histórico' },
  { from: '/historico',     to: '/projetos',      label: 'Histórico → Projetos' },
  { from: '/projetos',      to: '/configuracoes', label: 'Projetos → Config' },
  { from: '/configuracoes', to: '/dashboard',     label: 'Config → Ponto' },
] as const

const THRESHOLD_MS = 300

test.describe('Navegação entre abas', () => {
  test.beforeEach(async ({ page }) => {
    await injectSupabaseSession(page)
    await page.reload()
  })

  for (const { from, to, label } of ROUTES) {
    test(`${label} < ${THRESHOLD_MS}ms`, async ({ page }) => {
      await page.goto(from)
      await page.waitForSelector('[data-page-ready]', { timeout: 10_000 })

      const start = await page.evaluate(() => performance.now())

      await page.click(`a[href="${to}"]:not([aria-disabled="true"])`)

      await page.waitForSelector('[data-page-ready]', { timeout: 10_000 })

      const elapsed = await page.evaluate(
        (s) => Math.round(performance.now() - s),
        start
      )

      console.log(`  ✓ ${label}: ${elapsed}ms`)
      expect(
        elapsed,
        `${label} levou ${elapsed}ms — acima do limite de ${THRESHOLD_MS}ms`
      ).toBeLessThan(THRESHOLD_MS)
    })
  }
})
