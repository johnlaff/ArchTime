import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClock } from '../use-clock'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/offline-queue', () => ({ addPendingEntry: vi.fn() }))

import { toast } from 'sonner'

function makeFetchOk(body: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  })
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

  it('clock-in: sets optimistic session immediately, then updates with real ID on success', async () => {
    const realEntry = { id: 'real-id-123', clockIn: '2026-05-24T12:00:00Z' }
    vi.stubGlobal('fetch', makeFetchOk(realEntry))

    const { result } = renderHook(() => useClock(null))

    expect(result.current.session).toBeNull()

    await act(async () => {
      await result.current.clockIn('project-1')
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

  it('clock-out: clears session immediately, restores on API failure', async () => {
    const initialSession = {
      id: 'session-abc',
      clockIn: '2026-05-24T09:00:00Z',
      projectId: null,
      projectName: null,
      projectColor: null,
    }
    vi.stubGlobal('fetch', makeFetchFail({}, 500))

    const { result } = renderHook(() => useClock(initialSession))

    expect(result.current.session?.id).toBe('session-abc')

    await act(async () => {
      await result.current.clockOut()
    })

    expect(result.current.session?.id).toBe('session-abc')
    expect(result.current.loading).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Erro ao registrar saída')
  })

  it('clock-out: clears session permanently on success', async () => {
    const initialSession = {
      id: 'session-abc',
      clockIn: '2026-05-24T09:00:00Z',
      projectId: null,
      projectName: null,
      projectColor: null,
    }
    vi.stubGlobal('fetch', makeFetchOk({}))

    const { result } = renderHook(() => useClock(initialSession))

    await act(async () => {
      await result.current.clockOut()
    })

    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Saída registrada!')
  })
})
