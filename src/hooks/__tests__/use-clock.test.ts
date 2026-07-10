import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClock } from '../use-clock'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/offline-queue', () => ({ addPendingEntry: vi.fn() }))

import { toast } from 'sonner'
import { addPendingEntry } from '@/lib/offline-queue'
import { REQUEST_PENDING_SYNC_EVENT } from '@/lib/sync-events'

const addPendingEntryMock = vi.mocked(addPendingEntry)

interface FetchResult {
  ok: boolean
  status?: number
  json: () => Promise<object>
}

// A fetch mock whose promise we resolve/reject manually, so we can assert the
// optimistic state that exists *before* the request settles.
function deferredFetch() {
  let resolve!: (value: FetchResult) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<FetchResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  const fn = vi.fn().mockReturnValue(promise)
  return { fn, resolve, reject }
}

function makeFetchFail(body: object, status = 400) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('useClock', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-optimistic' })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clock-in: shows optimistic session with temp ID immediately, then swaps to real ID on success', async () => {
    const { fn, resolve } = deferredFetch()
    vi.stubGlobal('fetch', fn)

    const { result } = renderHook(() => useClock(null))
    expect(result.current.session).toBeNull()

    // Fire without awaiting — the optimistic session must appear before the API responds.
    let pending: Promise<void>
    act(() => {
      pending = result.current.clockIn('project-1')
    })

    expect(result.current.session?.id).toBe('test-uuid-optimistic')
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolve({ ok: true, json: () => Promise.resolve({ id: 'real-id-123', clockIn: '2026-05-24T12:00:00Z' }) })
      await pending
    })

    expect(result.current.session?.id).toBe('real-id-123')
    expect(result.current.session?.clockIn).toBe('2026-05-24T12:00:00Z')
    expect(result.current.loading).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Entrada registrada!')
  })

  it('clock-in: rolls back session to null when API returns non-ok', async () => {
    vi.stubGlobal('fetch', makeFetchFail({ error: 'Já existe uma entrada ativa' }))

    const { result } = renderHook(() => useClock(null))

    await act(async () => {
      await result.current.clockIn(null)
    })

    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Já existe uma entrada ativa')
  })

  it('clock-in: rolls back session to null on network exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { result } = renderHook(() => useClock(null))

    await act(async () => {
      await result.current.clockIn(null)
    })

    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Erro ao registrar entrada')
  })

  it('clock-in offline: enfileira a entrada, inicia a sessão e avisa que será sincronizada', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    addPendingEntryMock.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useClock(null))

    await act(async () => {
      await result.current.clockIn('project-1', 'modelagem_3d')
    })

    expect(addPendingEntryMock).toHaveBeenCalledTimes(1)
    expect(result.current.session?.id).toBe('test-uuid-optimistic')
    expect(result.current.session?.activityType).toBe('modelagem_3d')
    expect(toast.warning).toHaveBeenCalledWith('Entrada salva offline. Será sincronizada ao reconectar.')
  })

  it('clock-in offline: IndexedDB indisponível mostra toast de erro e não inicia a sessão', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    addPendingEntryMock.mockRejectedValueOnce(new Error('IndexedDB unavailable'))

    const { result } = renderHook(() => useClock(null))

    // Não deve propagar rejeição não tratada.
    await act(async () => {
      await result.current.clockIn('project-1')
    })

    expect(addPendingEntryMock).toHaveBeenCalledTimes(1)
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Não foi possível salvar a entrada offline')
  })

  const closedSession = {
    id: 'session-abc',
    clockIn: '2026-05-24T09:00:00Z',
    projectId: null,
    projectName: null,
    projectColor: null,
    activityType: null,
  }

  it('clock-out: erro 4xx (permanente) restaura a sessão e mostra o erro', async () => {
    vi.stubGlobal('fetch', makeFetchFail({ error: 'Entrada não encontrada' }, 404))

    const { result } = renderHook(() => useClock(closedSession))
    await act(async () => {
      await result.current.clockOut()
    })

    expect(addPendingEntryMock).not.toHaveBeenCalled()
    expect(result.current.session?.id).toBe('session-abc')
    expect(result.current.loading).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Entrada não encontrada')
  })

  it('clock-out: erro 5xx (transitório) enfileira para retry preservando o entryId, mantém a sessão encerrada', async () => {
    addPendingEntryMock.mockResolvedValueOnce(undefined)
    vi.stubGlobal('fetch', makeFetchFail({}, 500))
    const requestSync = vi.fn()
    window.addEventListener(REQUEST_PENDING_SYNC_EVENT, requestSync)

    const { result } = renderHook(() => useClock(closedSession))
    await act(async () => {
      await result.current.clockOut()
    })

    window.removeEventListener(REQUEST_PENDING_SYNC_EVENT, requestSync)
    expect(addPendingEntryMock).toHaveBeenCalledTimes(1)
    const queued = addPendingEntryMock.mock.calls[0][0]
    expect(queued.type).toBe('clock_out')
    expect(queued.entryId).toBe('session-abc')
    expect(typeof queued.timestamp).toBe('string')
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalled()
    expect(requestSync).toHaveBeenCalledTimes(1)
  })

  it('clock-out: erro de rede enfileira para retry e mantém a sessão encerrada', async () => {
    addPendingEntryMock.mockResolvedValueOnce(undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { result } = renderHook(() => useClock(closedSession))
    await act(async () => {
      await result.current.clockOut()
    })

    expect(addPendingEntryMock).toHaveBeenCalledTimes(1)
    expect(addPendingEntryMock.mock.calls[0][0].type).toBe('clock_out')
    expect(result.current.session).toBeNull()
    expect(toast.warning).toHaveBeenCalled()
  })

  it('clock-out: 5xx mas a fila falha → restaura a sessão e mostra erro', async () => {
    addPendingEntryMock.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
    vi.stubGlobal('fetch', makeFetchFail({}, 500))

    const { result } = renderHook(() => useClock(closedSession))
    await act(async () => {
      await result.current.clockOut()
    })

    expect(result.current.session?.id).toBe('session-abc')
    expect(result.current.loading).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Erro ao registrar saída')
  })

  it('clock-out offline: enfileira e mantém a sessão encerrada', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    addPendingEntryMock.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useClock(closedSession))
    await act(async () => {
      await result.current.clockOut()
    })

    expect(addPendingEntryMock).toHaveBeenCalledTimes(1)
    expect(addPendingEntryMock.mock.calls[0][0].type).toBe('clock_out')
    expect(result.current.session).toBeNull()
    expect(toast.warning).toHaveBeenCalled()
  })

  it('clock-out: sucesso mantém a sessão encerrada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }))

    const { result } = renderHook(() => useClock(closedSession))
    await act(async () => {
      await result.current.clockOut()
    })

    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Saída registrada!')
  })
})
