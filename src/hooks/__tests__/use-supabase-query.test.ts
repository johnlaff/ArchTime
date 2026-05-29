import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseQuery, clearClientQueryCache } from '@/hooks/use-supabase-query'

beforeEach(() => clearClientQueryCache())

describe('useSupabaseQuery', () => {
  it('loads data: loading true then resolves with data', async () => {
    const fetcher = vi.fn(async () => 42)
    const { result } = renderHook(() => useSupabaseQuery('k1', fetcher))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe(42)
    expect(result.current.error).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('serves cached data instantly to a second hook with the same key (no loading flash)', async () => {
    const fetcher = vi.fn(async () => 'cached')
    const first = renderHook(() => useSupabaseQuery('k2', fetcher))
    await waitFor(() => expect(first.result.current.data).toBe('cached'))

    const second = renderHook(() => useSupabaseQuery('k2', fetcher))
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.data).toBe('cached')
  })

  it('dedupes concurrent fetches for the same key', async () => {
    const fetcher = vi.fn(async () => 'x')
    renderHook(() => useSupabaseQuery('k3', fetcher))
    renderHook(() => useSupabaseQuery('k3', fetcher))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refetch triggers a fresh fetch', async () => {
    let n = 0
    const fetcher = vi.fn(async () => ++n)
    const { result } = renderHook(() => useSupabaseQuery('k4', fetcher))
    await waitFor(() => expect(result.current.data).toBe(1))

    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('captures fetch errors', async () => {
    const fetcher = vi.fn(async () => { throw new Error('boom') })
    const { result } = renderHook(() => useSupabaseQuery('k5', fetcher))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.message).toBe('boom')
  })
})
