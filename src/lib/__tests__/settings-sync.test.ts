import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldApplyRemoteAppearance } from '../appearance'
import {
  __resetSettingsSyncForTests,
  enqueueAppearancePatch,
  hasPendingAppearancePatch,
  restorePendingAppearanceSync,
} from '../settings-sync'

const PENDING_APPEARANCE_KEY = 'archtime-pending-appearance'

function successResponse(): Response {
  return new Response(null, { status: 204 })
}

function deferred<T>() {
  let resolve: (value: T) => void
  let reject: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve: resolve!, reject: reject! }
}

describe('settings appearance sync', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.clear()
    __resetSettingsSyncForTests()
    fetchMock.mockReset()
  })

  afterEach(() => {
    __resetSettingsSyncForTests()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('merges changes made during the debounce window into one PATCH', async () => {
    fetchMock.mockResolvedValue(successResponse())

    enqueueAppearancePatch({ accentPreset: 'blue' })
    await vi.advanceTimersByTimeAsync(399)
    enqueueAppearancePatch({ themeMode: 'dark' })

    await vi.advanceTimersByTimeAsync(400)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accentPreset: 'blue', themeMode: 'dark' }),
    })
  })

  it('waits for an in-flight PATCH before sending a later appearance change', async () => {
    const firstRequest = deferred<Response>()
    fetchMock.mockReturnValueOnce(firstRequest.promise).mockResolvedValueOnce(successResponse())

    enqueueAppearancePatch({ accentPreset: 'blue' })
    await vi.advanceTimersByTimeAsync(400)
    enqueueAppearancePatch({ themeMode: 'dark' })
    await vi.advanceTimersByTimeAsync(400)

    expect(fetchMock).toHaveBeenCalledOnce()

    firstRequest.resolve(successResponse())
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchMock).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeMode: 'dark' }),
    })
  })

  it('keeps the pending patch after a network failure and retries with backoff', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(successResponse())

    enqueueAppearancePatch({ customAccentColor: '#123456' })
    await vi.advanceTimersByTimeAsync(400)

    expect(JSON.parse(window.localStorage.getItem(PENDING_APPEARANCE_KEY) ?? '{}')).toEqual({
      customAccentColor: '#123456',
    })
    expect(fetchMock).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem(PENDING_APPEARANCE_KEY)).not.toBeNull()

    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetchMock).toHaveBeenCalledTimes(4)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(5)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetchMock).toHaveBeenCalledTimes(5)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(window.localStorage.getItem(PENDING_APPEARANCE_KEY)).toBeNull()
  })

  it('resends a durable pending patch when the app boots', async () => {
    fetchMock.mockResolvedValue(successResponse())
    window.localStorage.setItem(PENDING_APPEARANCE_KEY, JSON.stringify({ density: 'compact' }))

    restorePendingAppearanceSync()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledWith('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ density: 'compact' }),
    })
  })

  it('keeps local appearance when a durable patch is pending during hydration', () => {
    enqueueAppearancePatch({ themeMode: 'dark' })

    expect(hasPendingAppearancePatch()).toBe(true)
    expect(shouldApplyRemoteAppearance(20_000, null, hasPendingAppearancePatch())).toBe(false)
  })
})
