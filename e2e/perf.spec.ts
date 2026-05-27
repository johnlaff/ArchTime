import { test, expect } from '@playwright/test'
import { injectSupabaseSession } from './helpers/auth'

const ROUTES = [
  { from: '/dashboard',     to: '/historico',     label: 'Ponto → Histórico',     fromHeading: 'Ponto',         toHeading: 'Histórico' },
  { from: '/historico',     to: '/projetos',      label: 'Histórico → Projetos',  fromHeading: 'Histórico',     toHeading: 'Projetos' },
  { from: '/projetos',      to: '/configuracoes', label: 'Projetos → Config',     fromHeading: 'Projetos',      toHeading: 'Configurações' },
  { from: '/configuracoes', to: '/dashboard',     label: 'Config → Ponto',        fromHeading: 'Configurações', toHeading: 'Ponto' },
] as const

const THRESHOLD_MS = 300

test.describe('Navegação entre abas', () => {
  test.beforeEach(async ({ page }) => {
    await injectSupabaseSession(page)
    await page.reload()
  })

  for (const { from, to, label, fromHeading, toHeading } of ROUTES) {
    test(`${label} < ${THRESHOLD_MS}ms`, async ({ page }) => {
      await page.goto(from)
      await expect(page.getByRole('heading', { name: fromHeading })).toBeVisible({ timeout: 10_000 })

      const start = await page.evaluate(() => performance.now())

      await page.click(`a[href="${to}"]:not([aria-disabled="true"])`)
      await page.waitForURL(`**${to}`, { timeout: 10_000 })
      await expect(page.getByRole('heading', { name: toHeading })).toBeVisible({ timeout: 10_000 })

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
