import { test, expect, type Page } from '@playwright/test'

// Visual capture harness: drives the authenticated app (storageState from
// auth.setup.ts) and writes screenshots to e2e/screenshots/ so the UI can be
// reviewed without manually opening the preview. Not an assertion suite.

const DIR = 'e2e/screenshots'

// Capture tooling, not an assertion suite: opt-in via SHOTS=1 so `npm run test:e2e`
// stays focused on functional assertions (the dev server is slow/uneven for full-page
// captures). Run: `SHOTS=1 npx playwright test --project=chromium screenshots.spec.ts`.
test.beforeEach(() => {
  test.skip(!process.env.SHOTS, 'Captura sob demanda: rode com SHOTS=1')
})

async function gotoDashboard(page: Page) {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 30_000 })
  // ActivityPanel is lazy + fetches /api/activity/overview; wait past the skeleton.
  await expect(page.getByRole('tab', { name: 'Semestre' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(900) // chart/heatmap settle
}

async function setDark(page: Page, dark: boolean) {
  await page.addInitScript((d) => {
    try {
      localStorage.setItem('theme', d ? 'dark' : 'light')
    } catch {}
  }, dark)
}

test('dashboard desktop (light)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await setDark(page, false)
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/dashboard-desktop-light.png`, fullPage: true })
  await page.getByTestId('activity-panel').screenshot({ path: `${DIR}/panel-semestre-light.png` })

  await page.getByRole('tab', { name: 'Ano' }).click()
  await page.waitForTimeout(600)
  await page.getByTestId('activity-panel').screenshot({ path: `${DIR}/panel-ano-light.png` })

  await page.getByRole('tab', { name: 'Semana' }).click()
  await page.waitForTimeout(600)
  await page.getByTestId('activity-panel').screenshot({ path: `${DIR}/panel-semana-light.png` })
})

test('dashboard desktop (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await setDark(page, true)
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/dashboard-desktop-dark.png`, fullPage: true })
  await page.getByRole('tab', { name: 'Mês' }).click()
  await expect(page.getByTestId('activity-panel').getByText('Total:')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('activity-panel').screenshot({ path: `${DIR}/panel-mes-dark.png` })
})

test('dashboard mobile (light)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setDark(page, false)
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/dashboard-mobile-light.png`, fullPage: true })
})

test('historico desktop (light)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await setDark(page, false)
  await page.goto('/historico')
  await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${DIR}/historico-desktop-light.png`, fullPage: true })
})
