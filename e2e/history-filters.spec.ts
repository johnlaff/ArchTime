import { test, expect } from '@playwright/test'

test.describe('Histórico — busca e filtros (server-side)', () => {
  test('busca textual dispara request com q= e mostra estado vazio', async ({ page }) => {
    await page.goto('/historico')
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 20_000 })

    const search = page.getByPlaceholder('Buscar projeto ou nota…')
    // A busca vai pro servidor (prova: q= na URL do /api/history) — filtra o mês
    // inteiro antes de paginar, não só a página carregada.
    const req = page.waitForRequest(
      (r) => r.url().includes('/api/history') && /[?&]q=/.test(r.url()),
      { timeout: 10_000 }
    )
    await search.fill('zzqx-sem-correspondencia-zzz')
    await req
    await expect(page.getByText('Nenhum registro corresponde aos filtros.')).toBeVisible({ timeout: 10_000 })

    // limpar restaura
    await page.getByRole('button', { name: /Limpar filtros/ }).click()
    await expect(page.getByText('Nenhum registro corresponde aos filtros.')).toBeHidden()
  })

  test('filtro de atividade envia activityType ao servidor', async ({ page }) => {
    await page.goto('/historico')
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 20_000 })
    // garante hidratação + fetch inicial concluído antes de interagir com o dropdown
    await expect(page.getByPlaceholder('Buscar projeto ou nota…')).toBeVisible()
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Atividade' }).first().click()
    const radio = page.getByRole('menuitemradio', { name: 'Modelagem 3D' })
    await expect(radio).toBeVisible({ timeout: 10_000 })
    const req = page.waitForRequest(
      (r) => r.url().includes('/api/history') && r.url().includes('activityType=modelagem'),
      { timeout: 10_000 }
    )
    await radio.click()
    await req
  })

  test('filtro de projeto e intervalo de datas abrem', async ({ page }) => {
    await page.goto('/historico')
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByPlaceholder('Buscar projeto ou nota…')).toBeVisible()
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Projeto' }).first().click()
    await expect(page.getByRole('menuitemradio', { name: 'Todos os projetos' })).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Datas/ }).first().click()
    // (não asserto o texto "Intervalo de datas" — existe no popover e no botão
    // mobile oculto; os inputs com label são inequívocos.)
    await expect(page.getByLabel('Data inicial')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Data final')).toBeVisible()
  })
})
