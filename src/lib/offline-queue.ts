import { openDB, type IDBPDatabase } from 'idb'
import type { PendingEntry } from '@/types'

const DB_NAME = 'archtime-offline'
const DB_VERSION = 1
const STORE = 'pending-entries'

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
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

export async function syncPendingEntries(): Promise<void> {
  let entries: PendingEntry[]
  try {
    entries = await getPendingEntries()
  } catch {
    return // IndexedDB not available (SSR ou incognito)
  }

  if (entries.length === 0) return

  // Ordem cronológica — clock_in deve preceder clock_out da mesma sessão
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  for (const entry of entries) {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      if (!res.ok) break // Erro no servidor — parar e tentar depois
      await removePendingEntry(entry.id)
    } catch {
      break // Erro de rede — ainda offline
    }
  }
}
