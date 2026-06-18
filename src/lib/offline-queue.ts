import { openDB, type IDBPDatabase } from 'idb'
import type { FailedPendingEntry, PendingEntry } from '@/types'

const DB_NAME = 'archtime-offline'
const DB_VERSION = 2
const STORE = 'pending-entries'
const FAILED_STORE = 'failed-entries'

export interface SyncResult {
  synced: number
  failed: number
  remaining: number
}

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(FAILED_STORE)) {
        db.createObjectStore(FAILED_STORE, { keyPath: 'id' })
      }
    },
  })
}

export async function addPendingEntry(entry: PendingEntry): Promise<void> {
  const db = await getDB()
  await db.put(STORE, entry)
}

export async function getPendingEntries(): Promise<PendingEntry[]> {
  const db = await getDB()
  return db.getAll(STORE)
}

export async function removePendingEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, id)
}

export async function getFailedEntries(): Promise<FailedPendingEntry[]> {
  const db = await getDB()
  return db.getAll(FAILED_STORE)
}

async function moveToFailedEntry(
  entry: PendingEntry,
  status: number,
  error: string
): Promise<void> {
  // react-doctor-disable-next-line react-doctor/async-parallel -- a ordem é obrigatória: o put no FAILED_STORE precede o delete do STORE. Como db.put/db.delete do idb abrem transações separadas, paralelizar com Promise.all poderia commitar o delete antes do put e perder a entry num crash entre as duas operações.
  const db = await getDB()
  await db.put(FAILED_STORE, {
    ...entry,
    failedAt: new Date().toISOString(),
    status,
    error,
  } satisfies FailedPendingEntry)
  await db.delete(STORE, entry.id)
}

export async function syncPendingEntries(): Promise<SyncResult> {
  let entries: PendingEntry[]
  try {
    entries = await getPendingEntries()
  } catch {
    return { synced: 0, failed: 0, remaining: 0 } // IndexedDB not available (SSR ou incognito)
  }

  if (entries.length === 0) return { synced: 0, failed: 0, remaining: 0 }

  // Ordem cronológica — clock_in deve preceder clock_out da mesma sessão
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  let synced = 0
  let failed = 0

  for (const entry of entries) {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })

      if (!res.ok) {
        let payload: { error?: string; permanent?: boolean } = {}
        try {
          payload = await res.json()
        } catch {}

        if (res.status >= 400 && res.status < 500 && payload.permanent !== false) {
          await moveToFailedEntry(entry, res.status, payload.error ?? 'Erro permanente')
          failed += 1
          continue
        }

        break // rede/5xx/temporário — manter fila e tentar depois
      }

      await removePendingEntry(entry.id)
      synced += 1
    } catch {
      break // Erro de rede — ainda offline
    }
  }

  const remaining = (await getPendingEntries()).length
  return { synced, failed, remaining }
}
