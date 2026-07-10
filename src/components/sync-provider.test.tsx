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
})
