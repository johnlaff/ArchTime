'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Entry<T> {
  data?: T
  error?: Error
  inflight?: Promise<T>
}

// Module-level cache: survives client navigations (instant revisits), cleared on
// logout via clearClientQueryCache() to avoid leaking one user's reads to another.
const store = new Map<string, Entry<unknown>>()

// Per-key generation counter: guards against an out-of-order response
// clobbering a newer one (e.g. a background focus-revalidate still in flight
// resolves AFTER a refetch() triggered by a mutation — the stale result must
// not overwrite the fresher one already in the cache).
const generations = new Map<string, number>()

export function clearClientQueryCache(): void {
  store.clear()
  generations.clear()
}

export interface UseSupabaseQueryResult<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refetch: () => void
}

/**
 * Minimal stale-while-revalidate reader (no extra dependency):
 * - returns cached data immediately on revisit (no skeleton flash),
 * - dedupes concurrent in-flight fetches by key,
 * - revalidates on window focus + reconnect (background, keeps data visible),
 * - `refetch()` forces a fresh read (use after a write to reconcile the cache).
 */
export function useSupabaseQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
): UseSupabaseQueryResult<T> {
  const cached = store.get(key) as Entry<T> | undefined
  const [data, setData] = useState<T | undefined>(cached?.data)
  const [error, setError] = useState<Error | undefined>(cached?.error)
  const [loading, setLoading] = useState<boolean>(cached?.data === undefined)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const mountedRef = useRef(true)

  const load = useCallback(() => {
    const entry = (store.get(key) as Entry<T> | undefined) ?? {}
    if (entry.data === undefined) setLoading(true) // skeleton only when nothing to show
    // Claim a new generation: only the latest request may write. A response
    // landing out of order (e.g. a focus-revalidate still in flight when a
    // post-mutation refetch() resolves first) must not overwrite newer data.
    const gen = (generations.get(key) ?? 0) + 1
    generations.set(key, gen)
    const promise = entry.inflight ?? fetcherRef.current()
    store.set(key, { ...entry, inflight: promise })

    promise.then(
      (result) => {
        if (generations.get(key) !== gen) return // stale response; a newer request owns the cache
        store.set(key, { data: result })
        if (mountedRef.current) {
          setData(result)
          setError(undefined)
          setLoading(false)
        }
      },
      (err: unknown) => {
        if (generations.get(key) !== gen) return // stale failure; a newer request owns the cache
        const normalized = err instanceof Error ? err : new Error(String(err))
        const current = (store.get(key) as Entry<T> | undefined) ?? {}
        store.set(key, { ...current, inflight: undefined, error: normalized })
        if (mountedRef.current) {
          setError(normalized)
          setLoading(false)
        }
      },
    )
  }, [key])

  useEffect(() => {
    mountedRef.current = true
    load()
    const revalidate = () => {
      if (document.visibilityState !== 'hidden') load()
    }
    window.addEventListener('online', revalidate)
    window.addEventListener('focus', revalidate)
    return () => {
      mountedRef.current = false
      window.removeEventListener('online', revalidate)
      window.removeEventListener('focus', revalidate)
    }
  }, [load])

  const refetch = useCallback(() => {
    const entry = (store.get(key) as Entry<T> | undefined) ?? {}
    store.set(key, { ...entry, inflight: undefined }) // drop any stale in-flight handle
    load()
  }, [key, load])

  return { data, error, loading, refetch }
}
