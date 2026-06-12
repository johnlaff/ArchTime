import { test, expect, type Page } from '@playwright/test'
import { alpha, applyAppearance } from './helpers/appearance'

// Verificação visual + determinística das correções desta branch (fix/ui-consistency-pass).
// Sob demanda (SHOTS=1) — não polui a suíte de asserções funcionais.
// Roda: `SHOTS=1 npx playwright test --project=chromium verify-fixes.spec.ts`.

const DIR = 'e2e/screenshots'

test.beforeEach(() => {
  test.skip(!process.env.SHOTS, 'Verificação sob demanda: rode com SHOTS=1')
})

async function gotoDashboard(page: Page) {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'Semestre' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(900) // chart/heatmap settle
}

test('bug 3 + 5: aba "Semestre" e seletor neutro legível (dark + rosa custom)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await applyAppearance(page, { dark: true, pink: true })
  // Sem sessão aberta → o card de ponto mostra o seletor de projeto (a conta de
  // teste pode ter sessão ativa; o guard if(count) antigo só mascarava isso).
  await page.route('**/rest/v1/clock_entries**', async (route) => {
    const url = route.request().url()
    if (url.includes('clock_out=is.null') && url.includes('deleted_at=is.null')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.continue()
  })
  await gotoDashboard(page)

  // accent custom de fato aplicado
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-accent'))).toBe('custom')

  // bug 5: a pílula ativa precisa estar OPACA (bg-card venceu o bg-input/30 translúcido)
  const activeTab = page.getByRole('tab', { selected: true })
  const activeBg = await activeTab.evaluate((el) => getComputedStyle(el).backgroundColor)
  // eslint-disable-next-line no-console
  console.log(`[bug5] pílula ativa bg (dark+rosa): ${activeBg} (alpha=${alpha(activeBg)})`)
  expect(alpha(activeBg)).toBeGreaterThan(0.5)

  const projectSelector = page.getByRole('combobox').first()
  await expect(projectSelector).toBeVisible()
  const selectorBg = await projectSelector.evaluate((el) => getComputedStyle(el).backgroundColor)
  // eslint-disable-next-line no-console
  console.log(`[bug projeto] seletor bg (dark+rosa): ${selectorBg} (alpha=${alpha(selectorBg)})`)
  expect(alpha(selectorBg), 'seletor de projeto deve ser opaco').toBeGreaterThan(0.5)

  await page.getByTestId('activity-panel').screenshot({ path: `${DIR}/verify-panel-semestre-pinkdark.png` })

  await page.getByRole('tab', { name: 'Mês' }).click()
  await expect(page.getByTestId('activity-panel').getByText('Total:')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('activity-panel').screenshot({ path: `${DIR}/verify-panel-mes-pinkdark.png` })

  // bug 2: barras da semana seguem o accent (rosa), não verde
  await page.getByRole('tab', { name: 'Semana' }).click()
  await page.waitForTimeout(700)
  await page.getByTestId('activity-panel').screenshot({ path: `${DIR}/verify-panel-semana-pinkdark.png` })
})

test('bug 4 + 6: sidebar sem Relatórios/Faturamento e busca sem atalho', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await applyAppearance(page, { dark: false })
  await gotoDashboard(page)

  const sidebar = page.locator('aside').first()
  await expect(sidebar.getByText('Relatórios')).toHaveCount(0)
  await expect(sidebar.getByText('Faturamento')).toHaveCount(0)

  const trigger = page.getByRole('button', { name: 'Abrir comando rápido' })
  await expect(trigger).toBeVisible()
  await expect(trigger.locator('kbd')).toHaveCount(0)

  await sidebar.screenshot({ path: `${DIR}/verify-sidebar-light.png` })
})

test('bug 1: busca do histórico opaca (light + dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const dark of [false, true]) {
    await applyAppearance(page, { dark })
    await page.goto('/historico')
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(500)

    const search = page.getByRole('textbox', { name: 'Buscar no histórico' })
    await expect(search).toBeVisible()
    const bg = await search.evaluate((el) => getComputedStyle(el).backgroundColor)
    // eslint-disable-next-line no-console
    console.log(`[bug1] busca histórico bg (dark=${dark}): ${bg} (alpha=${alpha(bg)})`)
    expect(alpha(bg), `busca deve ser opaca (dark=${dark})`).toBeGreaterThan(0.5)

    await search.screenshot({ path: `${DIR}/verify-historico-search-${dark ? 'dark' : 'light'}.png` })
  }
})
