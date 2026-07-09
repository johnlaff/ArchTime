import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClock } from '../use-clock'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/offline-queue', () => ({ addPendingEntry: vi.fn() }))

import { toast } from 'sonner'
import { addPendingEntry } from '@/lib/offline-queue'

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

  it('clock-out: clears session immediately, restores snapshot on API failure', async () => {
    const initialSession = {
      id: 'session-abc',
      clockIn: '2026-05-24T09:00:00Z',
      projectId: null,
      projectName: null,
      projectColor: null,
      activityType: null,
    }
    const { fn, resolve } = deferredFetch()
    vi.stubGlobal('fetch', fn)

    const { result } = renderHook(() => useClock(initialSession))
    expect(result.current.session?.id).toBe('session-abc')

    // Fire without awaiting — the session must clear before the API responds.
    let pending: Promise<void>
    act(() => {
      pending = result.current.clockOut()
    })

    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
      await pending
    })

    expect(result.current.session?.id).toBe('session-abc')
    expect(result.current.loading).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Erro ao registrar saída')
  })

  it('clock-out: clears session immediately and keeps it cleared on success', async () => {
    const initialSession = {
      id: 'session-abc',
      clockIn: '2026-05-24T09:00:00Z',
      projectId: null,
      projectName: null,
      projectColor: null,
      activityType: null,
    }
    const { fn, resolve } = deferredFetch()
    vi.stubGlobal('fetch', fn)

    const { result } = renderHook(() => useClock(initialSession))

    let pending: Promise<void>
    act(() => {
      pending = result.current.clockOut()
    })

    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolve({ ok: true, json: () => Promise.resolve({}) })
      await pending
    })

    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Saída registrada!')
  })
})
