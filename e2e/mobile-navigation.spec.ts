import { test, expect, type Page } from '@playwright/test'
import { applyAppearance } from './helpers/appearance'

const dashboardHeading = { name: 'Ponto' }
const extremeMinutes = Number.MAX_SAFE_INTEGER

async function openDashboard(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 })
  await applyAppearance(page, { dark: false, blueprint: true })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', dashboardHeading)).toBeVisible({ timeout: 20_000 })
}

async function expectSummaryCardsFit(page: Page, contentWidth: number) {
  for (const card of [
    page.getByTestId('summary-card-today'),
    page.getByTestId('summary-card-week'),
    page.getByTestId('summary-card-month'),
  ]) {
    await expect(card).toBeVisible()
    const metrics = await card.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        gap: Number.parseFloat(style.rowGap),
        paddingBottom: Number.parseFloat(style.paddingBottom),
        paddingTop: Number.parseFloat(style.paddingTop),
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        width: element.getBoundingClientRect().width,
      }
    })

    // Com os dados normais da conta de teste, os três resumos devem continuar
    // intrínsecos — ocupar toda a coluna reintroduziria a área vazia reportada.
    expect(metrics.width).toBeLessThan(contentWidth)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight)
    expect(metrics.gap).toBe(0)
    expect(metrics.paddingTop).toBe(0)
    expect(metrics.paddingBottom).toBe(0)
  }
}

async function stubExtremeSummary(page: Page) {
  const balance = {
    actualMinutes: extremeMinutes,
    balanceMinutes: -extremeMinutes,
    expectedMinutes: extremeMinutes,
  }
  await page.route('**/api/clock/summary', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        entries: [],
        month: {
          ...balance,
          cumulativeBalance: extremeMinutes,
          showCumulativeBalance: true,
        },
        sessionCount: 0,
        today: balance,
        totalMinutes: extremeMinutes,
        week: balance,
      }),
    })
  })
}

test.describe('Dashboard mobile', () => {
  test('preserva a malha lateral e compacta os três resumos em 390 px', async ({ page }) => {
    await openDashboard(page, 390)

    const shell = page.locator('[data-page-ready="true"]')
    const shellMetrics = await shell.evaluate((element) => {
      const style = getComputedStyle(element)
      const paddingLeft = Number.parseFloat(style.paddingLeft)
      const paddingRight = Number.parseFloat(style.paddingRight)
      return {
        contentWidth: element.clientWidth - paddingLeft - paddingRight,
        paddingLeft,
        paddingRight,
      }
    })

    expect(shellMetrics.paddingLeft).toBe(32)
    expect(shellMetrics.paddingRight).toBe(32)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expectSummaryCardsFit(page, shellMetrics.contentWidth)
  })

  test('mantém conteúdo utilizável sem overflow em uma tela estreita de 320 px', async ({ page }) => {
    await openDashboard(page, 320)

    const shell = page.locator('[data-page-ready="true"]')
    const shellMetrics = await shell.evaluate((element) => {
      const style = getComputedStyle(element)
      const paddingLeft = Number.parseFloat(style.paddingLeft)
      const paddingRight = Number.parseFloat(style.paddingRight)
      return {
        contentWidth: element.clientWidth - paddingLeft - paddingRight,
        paddingLeft,
        paddingRight,
      }
    })

    expect(shellMetrics.paddingLeft).toBe(32)
    expect(shellMetrics.paddingRight).toBe(32)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expectSummaryCardsFit(page, shellMetrics.contentWidth)
  })

  test('quebra saldos excepcionalmente longos sem cortar o conteúdo em 320 px', async ({ page }) => {
    await stubExtremeSummary(page)
    await openDashboard(page, 320)

    for (const card of [
      page.getByTestId('summary-card-today'),
      page.getByTestId('summary-card-week'),
      page.getByTestId('summary-card-month'),
    ]) {
      await expect(card).toBeVisible()
      const metrics = await card.evaluate((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      }))
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight)
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('abre um menu rápido, preserva foco e navega pelo drawer', async ({ page }) => {
    await openDashboard(page, 390)

    const trigger = page.getByRole('button', { name: 'Abrir menu' })
    await trigger.click()

    const drawer = page.locator('[data-slot="sheet-content"]')
    await expect(drawer).toBeVisible()
    const duration = await drawer.evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration) * 1_000)
    expect(duration).toBeLessThanOrEqual(200)
    await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(drawer).toBeVisible()
    await drawer.getByRole('link', { name: 'Histórico' }).click()
    await expect(page).toHaveURL(/\/historico/)
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Dashboard a partir de sm', () => {
  test('restaura o espaçamento existente no limiar do breakpoint', async ({ page }) => {
    await openDashboard(page, 640)

    const padding = await page.locator('[data-page-ready="true"]').evaluate((element) => {
      const style = getComputedStyle(element)
      return { left: Number.parseFloat(style.paddingLeft), right: Number.parseFloat(style.paddingRight) }
    })

    expect(padding).toEqual({ left: 24, right: 24 })
  })
})

test.describe('Menu com redução de movimento', () => {
  test('remove a animação do drawer e do overlay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await openDashboard(page, 390)
    await page.getByRole('button', { name: 'Abrir menu' }).click()

    const drawer = page.locator('[data-slot="sheet-content"]')
    const overlay = page.locator('[data-slot="sheet-overlay"]')
    await expect(drawer).toBeVisible()
    await expect(overlay).toBeVisible()

    await expect(drawer).toHaveCSS('animation-duration', '0s')
    await expect(overlay).toHaveCSS('animation-duration', '0s')
  })
})
