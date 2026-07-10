import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

type FailureMode = 'network' | 'server'

test.describe.configure({ mode: 'serial' })

async function activeSession(request: APIRequestContext) {
  const response = await request.get('/api/clock/active')
  return response.json().catch(() => null) as Promise<{ id: string } | null>
}

async function exerciseRetry(
  page: Page,
  request: APIRequestContext,
  failureMode: FailureMode
) {
  const before = await activeSession(request)
  test.skip(Boolean(before), 'usuário tem uma sessão aberta real — pulando teste mutante')

  let entryId: string | undefined
  try {
    const clockIn = await request.post('/api/clock', { data: { projectId: null } })
    expect(clockIn.ok(), `clock-in de teste deveria criar uma Sessão (${clockIn.status()})`).toBeTruthy()
    entryId = (await clockIn.json()).id

    let failOnce = true
    await page.route(`**/api/clock/${entryId}`, async (route) => {
      if (failOnce && route.request().method() === 'PUT') {
        failOnce = false
        if (failureMode === 'network') {
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

    await expect.poll(() => activeSession(request), { timeout: 10_000 }).toBeNull()
  } finally {
    if (entryId) {
      await page.unroute(`**/api/clock/${entryId}`)
      // PUT idempotente fecha apenas a Sessão criada neste teste se o retry falhar cedo.
      await request.put(`/api/clock/${entryId}`).catch(() => {})
      await request.delete(`/api/clock/${entryId}`).catch(() => {})
    }
  }
}

test('clock-out recupera automaticamente de um 5xx sem a rede cair', async ({ page, request }) => {
  await exerciseRetry(page, request, 'server')
})

test('clock-out recupera automaticamente de uma falha de rede', async ({ page, request }) => {
  await exerciseRetry(page, request, 'network')
})
