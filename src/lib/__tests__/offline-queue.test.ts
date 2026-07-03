import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingEntry } from '@/types'
import {
  addPendingEntry,
  getFailedEntries,
  getPendingEntries,
  syncPendingEntries,
} from '../offline-queue'

// offline-queue.ts opens a fresh idb connection per call and never closes it
// (production code, out of scope here), so indexedDB.deleteDatabase() would
// block forever waiting for those leaked connections to close. Instead, open
// our own short-lived connection at the same version and clear both stores,
// closing it immediately after — this never triggers a versionchange/blocked
// wait since the version is unchanged.
function resetDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open('archtime-offline', 2)
    openRequest.onupgradeneeded = () => {
      const db = openRequest.result
      if (!db.objectStoreNames.contains('pending-entries')) {
        db.createObjectStore('pending-entries', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('failed-entries')) {
        db.createObjectStore('failed-entries', { keyPath: 'id' })
      }
    }
    openRequest.onsuccess = () => {
      const db = openRequest.result
      const tx = db.transaction(['pending-entries', 'failed-entries'], 'readwrite')
      tx.objectStore('pending-entries').clear()
      tx.objectStore('failed-entries').clear()
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    }
    openRequest.onerror = () => reject(openRequest.error)
  })
}

function makeEntry(overrides: Partial<PendingEntry> = {}): PendingEntry {
  return {
    id: 'entry-1',
    type: 'clock_in',
    timestamp: '2026-04-20T09:00:00.000Z',
    createdAt: '2026-04-20T09:00:00.000Z',
    ...overrides,
  }
}

describe('offline-queue', () => {
  beforeEach(async () => {
    await resetDb()
    vi.restoreAllMocks()
  })

  it('flushes pending entries in chronological (timestamp) order', async () => {
    await addPendingEntry(makeEntry({ id: 'c', timestamp: '2026-04-20T12:00:00.000Z' }))
    await addPendingEntry(makeEntry({ id: 'a', timestamp: '2026-04-20T09:00:00.000Z' }))
    await addPendingEntry(makeEntry({ id: 'b', timestamp: '2026-04-20T10:00:00.000Z' }))

    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(init.body as string)
        return new Response(null, { status: 200 })
      })
    )

    await syncPendingEntries()

    expect(bodies.map((body) => JSON.parse(body).id)).toEqual(['a', 'b', 'c'])
  })

  it('removes every entry from the queue once all sync requests succeed', async () => {
    await addPendingEntry(makeEntry({ id: 'a', timestamp: '2026-04-20T09:00:00.000Z' }))
    await addPendingEntry(makeEntry({ id: 'b', timestamp: '2026-04-20T10:00:00.000Z' }))
    await addPendingEntry(makeEntry({ id: 'c', timestamp: '2026-04-20T11:00:00.000Z' }))

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))

    const result = await syncPendingEntries()

    expect(result).toEqual({ synced: 3, failed: 0, remaining: 0 })
    await expect(getPendingEntries()).resolves.toEqual([])
  })

  it('moves a permanent 4xx failure to the failed store and continues flushing the rest', async () => {
    await addPendingEntry(makeEntry({ id: 'a', timestamp: '2026-04-20T09:00:00.000Z' }))
    await addPendingEntry(makeEntry({ id: 'b', timestamp: '2026-04-20T10:00:00.000Z' }))

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const id = JSON.parse(init.body as string).id
        if (id === 'a') {
          return new Response(JSON.stringify({ permanent: true, error: 'x' }), { status: 400 })
        }
        return new Response(null, { status: 200 })
      })
    )

    const result = await syncPendingEntries()

    expect(result).toEqual({ synced: 1, failed: 1, remaining: 0 })
    await expect(getPendingEntries()).resolves.toEqual([])
    const failedEntries = await getFailedEntries()
    expect(failedEntries).toHaveLength(1)
    expect(failedEntries[0]).toMatchObject({ id: 'a', status: 400, error: 'x' })
  })

  it('stops flushing and preserves the whole queue on a 5xx response', async () => {
    await addPendingEntry(makeEntry({ id: 'a', timestamp: '2026-04-20T09:00:00.000Z' }))
    await addPendingEntry(makeEntry({ id: 'b', timestamp: '2026-04-20T10:00:00.000Z' }))

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))

    const result = await syncPendingEntries()

    expect(result).toEqual({ synced: 0, failed: 0, remaining: 2 })
    await expect(getPendingEntries()).resolves.toHaveLength(2)
    await expect(getFailedEntries()).resolves.toEqual([])
  })

  it('stops flushing and preserves the whole queue on a network error', async () => {
    await addPendingEntry(makeEntry({ id: 'a', timestamp: '2026-04-20T09:00:00.000Z' }))
    await addPendingEntry(makeEntry({ id: 'b', timestamp: '2026-04-20T10:00:00.000Z' }))

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    const result = await syncPendingEntries()

    expect(result).toEqual({ synced: 0, failed: 0, remaining: 2 })
    await expect(getPendingEntries()).resolves.toHaveLength(2)
    await expect(getFailedEntries()).resolves.toEqual([])
  })
})
