import { test, expect, type Page } from '@playwright/test'
import { sameOriginHeaders } from './helpers/request'

type FailureMode = 'network' | 'response-lost' | 'server'

test.describe.configure({ mode: 'serial' })

async function activeSession(page: Page) {
  const response = await page.request.get('/api/clock/active')
  expect(response.ok(), `leitura da Sessão ativa deveria estar autenticada (${response.status()})`).toBeTruthy()
  return response.json() as Promise<{ id: string } | null>
}

async function exerciseRetry(
  page: Page,
  baseURL: string | undefined,
  failureMode: FailureMode
) {
  const headers = sameOriginHeaders(baseURL)
  const before = await activeSession(page)
  test.skip(Boolean(before), 'usuário tem uma sessão aberta real — pulando teste mutante')

  let entryId: string | undefined
  let primaryClockOutAt: string | undefined
  try {
    const clockIn = await page.request.post('/api/clock', { data: { projectId: null }, headers })
    expect(clockIn.ok(), `clock-in de teste deveria criar uma Sessão (${clockIn.status()})`).toBeTruthy()
    entryId = (await clockIn.json()).id

    let failOnce = true
    await page.route(`**/api/clock/${entryId}`, async (route) => {
      if (failOnce && route.request().method() === 'PUT') {
        failOnce = false
        if (failureMode === 'network') {
          await route.abort('failed')
        } else if (failureMode === 'response-lost') {
          primaryClockOutAt = route.request().postDataJSON().clockOutAt
          const committed = await route.fetch()
          expect(committed.ok(), `PUT primário deveria gravar a saída (${committed.status()})`).toBeTruthy()
          // A escrita chegou ao servidor, mas a resposta não ao PWA. O retry precisa
          // ser idempotente e preservar exatamente o horário enviado no primeiro clique.
          await route.abort('failed')
        } else {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Indisponibilidade temporária de teste' }),
          })
        }
        return
      }
      await route.continue()
    })

    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Em andamento' })).toBeVisible({ timeout: 20_000 })

    const syncResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/sync') && response.request().method() === 'POST',
      { timeout: 12_000 }
    )

    await page.getByRole('button', { name: /SAÍDA/ }).click()
    await expect(page.getByText('Saída salva. Será sincronizada automaticamente.')).toBeVisible({ timeout: 10_000 })

    const response = await syncResponse
    expect(response.ok(), `retry via /api/sync deveria fechar a Sessão (${response.status()})`).toBeTruthy()
    expect(JSON.parse(response.request().postData() ?? '{}')).toMatchObject({
      entryId,
      type: 'clock_out',
    })

    if (failureMode === 'response-lost') {
      expect(primaryClockOutAt, 'o PUT primário deve carregar o horário do clique').toBeTruthy()
      const idempotent = await page.request.put(`/api/clock/${entryId}`, {
        data: { clockOutAt: '2000-01-01T00:00:00.000Z' },
        headers,
      })
      expect(idempotent.ok(), `PUT idempotente deveria reler a Sessão (${idempotent.status()})`).toBeTruthy()
      expect((await idempotent.json()).clockOut).toBe(primaryClockOutAt)
    }

    await expect.poll(() => activeSession(page), { timeout: 10_000 }).toBeNull()
  } finally {
    if (entryId) {
      await page.unroute(`**/api/clock/${entryId}`)
      // PUT idempotente fecha apenas a Sessão criada neste teste se o retry falhar cedo.
      await page.request.put(`/api/clock/${entryId}`, { headers }).catch(() => {})
      await page.request.delete(`/api/clock/${entryId}`, { headers }).catch(() => {})
    }
  }
}

test('clock-out recupera automaticamente de um 5xx sem a rede cair', async ({ page, baseURL }) => {
  await exerciseRetry(page, baseURL, 'server')
})

test('clock-out recupera automaticamente de uma falha de rede', async ({ page, baseURL }) => {
  await exerciseRetry(page, baseURL, 'network')
})

test('clock-out preserva o horário quando a escrita conclui mas a resposta se perde', async ({ page, baseURL }) => {
  await exerciseRetry(page, baseURL, 'response-lost')
})
