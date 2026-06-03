import { test, expect } from '@playwright/test'

// Mutating end-to-end of the activity feature against the REAL prod DB, made safe:
// - skips entirely if the user has a real open session (won't touch it);
// - the entry it creates is deleted in `finally`, even on assertion failure.

const NOTE = '[e2e] verificação automática'

// ISO instant → "yyyy-MM-ddTHH:mm" wall-clock em BRT (com offset opcional em min).
function brtWall(iso: string, addMinutes = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(new Date(iso).getTime() + addMinutes * 60_000))
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

test('ponto com atividade: persiste, edita nota, busca e se auto-limpa', async ({ page, request }) => {
  test.setTimeout(120_000) // fluxo longo: várias navegações/loads + poll do servidor
  const activeBefore = await (await request.get('/api/clock/active')).json().catch(() => null)
  test.skip(Boolean(activeBefore), 'usuário tem uma sessão aberta real — pulando teste mutante')

  let entryId: string | undefined

  try {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Ponto' })).toBeVisible({ timeout: 20_000 })

    // 1) seleciona atividade e bate ENTRADA
    await page.getByRole('button', { name: 'Modelagem 3D' }).click()
    await page.getByRole('button', { name: /ENTRADA/ }).click()

    // 2) sessão ativa mostra a tag (escopo ao card "Em andamento")
    const sessionCard = page.locator('[data-slot="card"]').filter({ hasText: 'Em andamento' })
    await expect(sessionCard).toBeVisible({ timeout: 15_000 })
    await expect(sessionCard.getByText('Modelagem 3D')).toBeVisible()

    // 3) aguarda o POST confirmar no servidor (evita race) e valida a atividade
    let active: { id: string; clockIn: string; activityType: string } | null = null
    await expect
      .poll(
        async () => {
          active = await (await request.get('/api/clock/active')).json().catch(() => null)
          return active?.id ?? null
        },
        { timeout: 15_000, message: 'sessão ativa não apareceu no servidor após ENTRADA' }
      )
      .not.toBeNull()
    entryId = active!.id
    expect(active!.activityType).toBe('modelagem')

    // 4) reload → re-seed do servidor → tag persiste (prova leitura da coluna nova)
    await page.reload()
    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: 'Em andamento' }).getByText('Modelagem 3D')
    ).toBeVisible({ timeout: 15_000 })

    // 5) bate SAÍDA
    await page.getByRole('button', { name: /SAÍDA/ }).click()
    await expect(page.getByRole('button', { name: /ENTRADA/ })).toBeVisible({ timeout: 15_000 })

    // 6) dá duração válida à entrada via API. O clock-in/out instantâneo gera 0min,
    //    que o histórico (corretamente) omite. Recua a ENTRADA em 30min (a saída +30
    //    cairia no futuro e seria rejeitada), mantendo a atividade. Valida o PATCH.
    const inWall = brtWall(active!.clockIn, -30)
    const outWall = brtWall(active!.clockIn, 0)
    const patchRes = await request.patch(`/api/clock/${entryId}`, {
      data: { clockInAt: inWall, clockOutAt: outWall, activityType: 'modelagem' },
    })
    expect(patchRes.ok(), `PATCH de horários deveria ter sucesso (${patchRes.status()})`).toBeTruthy()
    const rowHHmm = inWall.slice(11, 16)

    // 7) no Histórico a linha aparece com a tag de atividade
    await page.goto('/historico')
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible({ timeout: 20_000 })
    const card = page.locator('[data-slot="card"]').filter({ hasText: `${rowHHmm} —` }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText('Modelagem 3D')).toBeVisible()

    // 8) edita pela UI: adiciona uma nota → aparece na linha (valida o dialog de edição)
    await card.getByRole('button', { name: 'Editar registro' }).click()
    await page.locator('#edit-notes').fill(NOTE)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Registro atualizado')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(NOTE).first()).toBeVisible({ timeout: 10_000 })

    // 9) busca server-side encontra a sessão pela nota (prova filtro por nota)
    const found = await (await request.get(`/api/history?q=${encodeURIComponent(NOTE)}`)).json()
    const match = (found?.history?.entries ?? []).find((e: { entryId: string }) => e.entryId === entryId)
    expect(match, 'a busca por nota deveria retornar a sessão').toBeTruthy()
    expect(match.activityType).toBe('modelagem')
    expect(match.notes).toContain('[e2e]')
  } finally {
    // Auto-limpeza robusta: mesmo se o id não foi capturado (falha cedo), busca a
    // sessão ativa e remove. Fecha (se aberta) e apaga — nunca deixa órfã.
    try {
      if (!entryId) {
        const a = await (await request.get('/api/clock/active')).json().catch(() => null)
        entryId = a?.id
      }
      if (entryId) {
        await request.put(`/api/clock/${entryId}`).catch(() => {})
        await request.delete(`/api/clock/${entryId}`).catch(() => {})
      }
    } catch {
      // best-effort
    }
  }
})
