import { createHmac, timingSafeEqual } from 'crypto'

const HASH_PREFIX = 'hmac-v1:'

export async function generateEntryHash(entry: {
  clockIn: string
  clockOut: string
  userId: string
  entryDate: string
}): Promise<string> {
  const secret =
    process.env.ENTRY_HASH_SECRET ??
    (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-entry-hash-secret')

  if (!secret) {
    throw new Error('ENTRY_HASH_SECRET is required to generate entry hashes')
  }

  const data = JSON.stringify({
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    userId: entry.userId,
    entryDate: entry.entryDate,
  })
  return `${HASH_PREFIX}${createHmac('sha256', secret).update(data).digest('hex')}`
}

/** Recomputa o HMAC e compara em tempo constante com o hash armazenado. */
export async function verifyEntryHash(
  entry: { clockIn: string; clockOut: string; userId: string; entryDate: string },
  storedHash: string
): Promise<boolean> {
  const expected = await generateEntryHash(entry)
  const a = Buffer.from(expected)
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}
