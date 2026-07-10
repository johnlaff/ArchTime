import { test, expect } from '@playwright/test'

test('integridade autenticada não confunde chave ausente com adulteração', async ({ page }) => {
  const response = await page.request.get('/api/integrity')
  const body = await response.json()

  expect(response.status()).toBe(200)
  expect(body).toEqual(expect.objectContaining({
    checked: expect.any(Number),
    unhashed: expect.any(Number),
    malformed: [],
    mismatches: [],
    unverifiable: [],
  }))
  expect(response.headers()['cache-control']).toContain('private')
})
