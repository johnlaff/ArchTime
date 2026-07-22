import { test, expect, type Page } from '@playwright/test'
import { applyAppearance } from './helpers/appearance'

/** Luminância relativa (WCAG) de um hex #rrggbb. */
function luminance(hex: string): number {
  const channel = (start: number) => {
    const v = parseInt(hex.slice(start, start + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

async function readThemeColor(page: Page): Promise<string> {
  return expect
    .poll(
      () => page.locator('meta[name="theme-color"]').getAttribute('content'),
      { message: 'ThemeColorSync deve criar o <meta name="theme-color"> no runtime', timeout: 15_000 }
    )
    .toMatch(/^#[0-9a-f]{6}$/i)
    .then(async () => (await page.locator('meta[name="theme-color"]').getAttribute('content')) ?? '')
}

// O accent rosa saturado (#ec4899) tem luminância ~0.30. Se a status bar seguisse o
// accent (o bug), ela cairia nessa faixa média em ambos os temas. Seguindo o fundo,
// ela é escura no dark e clara no light — bem fora dessa faixa.
test('a status bar (theme-color) segue o fundo do tema escuro, não o accent', async ({ page }) => {
  await applyAppearance(page, { dark: true, pink: true })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 30_000 })

  const color = await readThemeColor(page)
  expect(luminance(color), `theme-color ${color} deveria ser um fundo escuro`).toBeLessThan(0.05)
})

test('a status bar (theme-color) segue o fundo do tema claro, não o accent', async ({ page }) => {
  await applyAppearance(page, { dark: false, pink: true })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 30_000 })

  const color = await readThemeColor(page)
  expect(luminance(color), `theme-color ${color} deveria ser um fundo claro`).toBeGreaterThan(0.85)
})
