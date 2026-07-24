import { test, expect, type Page } from '@playwright/test'

// Harness de captura visual das correções de aparência (accent custom em OKLCH,
// tinte de fundo proporcional, react-colorful, trilhas da Distribuição). Somente
// leitura: o accent é forçado via localStorage ANTES do load — nenhuma interação
// dispara persistência — e o carimbo local recente impede a hidratação remota de
// reverter a cor durante a captura. Opt-in via QA_SHOTS=1; saída em QA_SHOTS_DIR.

const DIR = process.env.QA_SHOTS_DIR ?? 'e2e/screenshots'

test.beforeEach(() => {
  test.skip(!process.env.QA_SHOTS, 'Captura sob demanda: rode com QA_SHOTS=1')
})

async function forceAppearance(
  page: Page,
  opts: { dark: boolean; accent?: string; customHex?: string }
) {
  await page.addInitScript((o) => {
    try {
      localStorage.setItem('theme', o.dark ? 'dark' : 'light')
      if (o.accent) localStorage.setItem('archtime-accent', o.accent)
      if (o.customHex) localStorage.setItem('archtime-accent-custom', o.customHex)
      localStorage.setItem('archtime-bg-tint', 'on')
      // Dentro da janela de graça: a hidratação remota não sobrescreve o forçado.
      localStorage.setItem('archtime-preferences-updated-at', String(Date.now()))
    } catch {}
  }, opts)
}

async function gotoDashboard(page: Page) {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(900)
}

test('amarelo vivo (light): sidebar, logo, distribuição e fundo', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 })
  await forceAppearance(page, { dark: false, accent: 'custom', customHex: '#eab308' })
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/qa-yellow-light.png`, fullPage: false })
})

test('amarelo vivo (dark): sidebar, logo, distribuição e fundo', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 })
  await forceAppearance(page, { dark: true, accent: 'custom', customHex: '#eab308' })
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/qa-yellow-dark.png`, fullPage: false })
})

test('vermelho vivo vs pastel (light): tinte de fundo acompanha o croma', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 })
  await forceAppearance(page, { dark: false, accent: 'custom', customHex: '#dc2626' })
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/qa-red-vivid-light.png`, fullPage: false })
})

test('rosa pastel (light): tinte de fundo mais sutil que o vivo', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 })
  await forceAppearance(page, { dark: false, accent: 'custom', customHex: '#e8a2b8' })
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/qa-pink-pastel-light.png`, fullPage: false })
})

test('seletor react-colorful no menu mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await forceAppearance(page, { dark: false, accent: 'custom', customHex: '#0ea5e9' })
  await gotoDashboard(page)
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await expect(page.getByText('Cor de destaque')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DIR}/qa-picker-mobile.png`, fullPage: false })
})

test('preset índigo (light): baseline sem regressão', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 })
  await forceAppearance(page, { dark: false, accent: 'indigo' })
  await gotoDashboard(page)
  await page.screenshot({ path: `${DIR}/qa-indigo-baseline-light.png`, fullPage: false })
})
