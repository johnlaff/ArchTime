import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncProvider } from './sync-provider'
import { REQUEST_PENDING_SYNC_EVENT, SYNC_COMPLETE_EVENT } from '@/lib/sync-events'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/offline-queue', () => ({ syncPendingEntries: vi.fn() }))

import { syncPendingEntries } from '@/lib/offline-queue'

const syncPendingEntriesMock = vi.mocked(syncPendingEntries)

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('SyncProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setOnline(false)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('reenvia automaticamente uma fila transitória solicitada enquanto o app permanece online', async () => {
    syncPendingEntriesMock
      .mockResolvedValueOnce({ synced: 0, failed: 0, remaining: 1 })
      .mockResolvedValueOnce({ synced: 1, failed: 0, remaining: 0 })
    const completed = vi.fn()
    window.addEventListener(SYNC_COMPLETE_EVENT, completed)

    render(<SyncProvider><div /></SyncProvider>)
    setOnline(true)
    act(() => window.dispatchEvent(new Event(REQUEST_PENDING_SYNC_EVENT)))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })

    window.removeEventListener(SYNC_COMPLETE_EVENT, completed)
    expect(syncPendingEntriesMock).toHaveBeenCalledTimes(2)
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({
      detail: { synced: 1, failed: 0, remaining: 0 },
    }))
  })

  it('não agenda retry depois que o provider desmonta durante uma sincronização', async () => {
    setOnline(true)
    let resolveFirst!: (result: { synced: number; failed: number; remaining: number }) => void
    syncPendingEntriesMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve })
    )

    const { unmount } = render(<SyncProvider><div /></SyncProvider>)
    expect(syncPendingEntriesMock).toHaveBeenCalledTimes(1)
    unmount()

    await act(async () => {
      resolveFirst({ synced: 0, failed: 0, remaining: 1 })
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(syncPendingEntriesMock).toHaveBeenCalledTimes(1)
  })

  it('não cancela o retry pedido enquanto uma sincronização anterior termina sem pendências', async () => {
    setOnline(true)
    let resolveFirst!: (result: { synced: number; failed: number; remaining: number }) => void
    syncPendingEntriesMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ synced: 1, failed: 0, remaining: 0 })

    render(<SyncProvider><div /></SyncProvider>)
    expect(syncPendingEntriesMock).toHaveBeenCalledTimes(1)

    act(() => window.dispatchEvent(new Event(REQUEST_PENDING_SYNC_EVENT)))
    await act(async () => {
      resolveFirst({ synced: 0, failed: 0, remaining: 0 })
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(syncPendingEntriesMock).toHaveBeenCalledTimes(2)
  })
})
