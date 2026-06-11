import { test, expect, type Page } from '@playwright/test'

function alpha(color: string): number {
  const rgba = color.match(/rgba?\([^)]*?(?:,\s*([\d.]+))?\)$/)
  if (rgba && rgba[1] !== undefined) return Number(rgba[1])
  const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)/)
  if (slash) return slash[2] === '%' ? Number(slash[1]) / 100 : Number(slash[1])
  return 1
}

async function applyDarkPinkBlueprint(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'dark')
      localStorage.setItem('archtime-blueprint', 'true')
      localStorage.removeItem('archtime-preset')
      localStorage.setItem('archtime-accent', 'custom')
      localStorage.setItem('archtime-accent-custom', '#ec4899')
      localStorage.setItem('archtime-preferences-updated-at', String(Date.now()))
    } catch {}
  })
}

test('heatmap mensal fica legível no escuro com rosa custom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await applyDarkPinkBlueprint(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'Mês' })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('tab', { name: 'Mês' }).click()
  const panel = page.getByTestId('activity-panel')
  await expect(panel.getByText('Total:')).toBeVisible()
  await expect(panel.getByText('Dias ativos:')).toBeVisible()

  await expect.poll(async () => {
    const bg = await page.getByRole('tab', { selected: true }).evaluate((el) => getComputedStyle(el).backgroundColor)
    return alpha(bg)
  }, { message: 'aba ativa deve ficar opaca após a transição' }).toBeGreaterThan(0.95)

  const swatches = panel.locator('span[aria-hidden="true"]')
  await expect(swatches).toHaveCount(5)
  const colors = await swatches.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(colors[0], 'nível 0 e nível 4 não podem colapsar na mesma cor').not.toBe(colors[4])
  for (const color of colors) {
    expect(alpha(color), `swatch deve ser opaco: ${color}`).toBeGreaterThan(0.95)
  }
})

test('seletor de projeto fica opaco sobre blueprint no escuro', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await applyDarkPinkBlueprint(page)
  await page.route('**/rest/v1/clock_entries**', async (route) => {
    const url = route.request().url()
    if (url.includes('clock_out=is.null') && url.includes('deleted_at=is.null')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.continue()
  })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 30_000 })

  const projectSelector = page.getByRole('combobox').first()
  await expect(projectSelector).toBeVisible()
  const bg = await projectSelector.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(alpha(bg), `seletor deve ser opaco: ${bg}`).toBeGreaterThan(0.95)
})

test('busca do histórico continua opaca sobre blueprint no escuro', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await applyDarkPinkBlueprint(page)
  await page.goto('/historico')
  await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 30_000 })

  const search = page.getByRole('textbox', { name: 'Buscar no histórico' })
  await expect(search).toBeVisible()
  const bg = await search.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(alpha(bg), `busca deve ser opaca: ${bg}`).toBeGreaterThan(0.95)
})
