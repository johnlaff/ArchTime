import { test, expect } from '@playwright/test'

const PLACEHOLDER = /Bater ponto, ir para projeto/

test.describe('Command palette', () => {
  test('abre por atalho, busca, navega e fecha', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 20_000 })

    // ⌘K/Ctrl K — o app escuta metaKey||ctrlKey
    await page.keyboard.press('Control+k')
    const input = page.getByPlaceholder(PLACEHOLDER)
    await expect(input).toBeVisible({ timeout: 5_000 })

    // seções esperadas
    await expect(page.getByText('Ações', { exact: true })).toBeVisible()
    await expect(page.getByText('Navegar', { exact: true })).toBeVisible()
    await expect(page.getByText('Aparência', { exact: true })).toBeVisible()

    // busca fuzzy + executa navegação por teclado (cmdk é keyboard-first)
    await input.fill('histor')
    await expect(page.getByRole('option', { name: /Histórico/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/historico/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 10_000 })

    // reabre e fecha com Escape
    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder(PLACEHOLDER)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder(PLACEHOLDER)).toBeHidden()
  })

  test('botão de busca abre a palette', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Abrir comando rápido' }).first().click()
    await expect(page.getByPlaceholder(PLACEHOLDER)).toBeVisible({ timeout: 5_000 })
  })

  test('mostra a ação de ponto e vazio sem resultados', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Control+k')
    const input = page.getByPlaceholder(PLACEHOLDER)
    await expect(input).toBeVisible({ timeout: 5_000 })
    // ação de bater ponto presente (contextual)
    await expect(page.getByRole('option', { name: /Bater ponto|Registrar saída/ })).toBeVisible()
    // sem resultado
    await input.fill('xyzq-inexistente-zzz')
    await expect(page.getByText('Nenhum comando encontrado.')).toBeVisible()
  })
})
