import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  assertEntryHashConfiguration,
  getEntryHashConfiguration,
} from '@/lib/entry-hash-config'
import {
  ENTRY_HASH_DIGEST_PATTERN,
  ENTRY_HASH_KEY_ID_PATTERN,
  ENTRY_HASH_PREFIX,
} from '@/lib/entry-hash-format'

type HashInput = {
  clockIn: string
  clockOut: string
  userId: string
  entryDate: string
}

type ParsedHash = { keyId: string | null; digest: string }

export type EntryHashVerification =
  | { status: 'valid' }
  | { status: 'malformed' }
  | { status: 'mismatch' }
  | { status: 'unknown-key'; keyId: string }

export { assertEntryHashConfiguration }
export { assertEntryHashConfiguration as assertEntryHashSecret }

function payload(entry: HashInput): string {
  return JSON.stringify({
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    userId: entry.userId,
    entryDate: entry.entryDate,
  })
}

function digest(entry: HashInput, secret: string): string {
  return createHmac('sha256', secret).update(payload(entry)).digest('hex')
}

function parseHash(storedHash: string): ParsedHash | null {
  const parts = storedHash.split(':')
  if (parts[0] !== ENTRY_HASH_PREFIX) return null

  if (parts.length === 2 && ENTRY_HASH_DIGEST_PATTERN.test(parts[1])) {
    return { keyId: null, digest: parts[1] }
  }
  if (
    parts.length === 3 &&
    ENTRY_HASH_KEY_ID_PATTERN.test(parts[1]) &&
    ENTRY_HASH_DIGEST_PATTERN.test(parts[2])
  ) {
    return { keyId: parts[1], digest: parts[2] }
  }
  return null
}

function sameDigest(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

export async function generateEntryHash(entry: HashInput): Promise<string> {
  const configuration = getEntryHashConfiguration()
  const value = digest(entry, configuration.active.secret)
  return configuration.keyed
    ? `${ENTRY_HASH_PREFIX}:${configuration.active.keyId}:${value}`
    : `${ENTRY_HASH_PREFIX}:${value}`
}

/** Recomputa o HMAC e informa se a chave necessária ainda está disponível. */
export async function verifyEntryHashDetailed(
  entry: HashInput,
  storedHash: string
): Promise<EntryHashVerification> {
  const parsed = parseHash(storedHash)
  if (!parsed) return { status: 'malformed' }

  const configuration = getEntryHashConfiguration()
  const secret = parsed.keyId === null
    ? configuration.legacy.secret
    : configuration.keys.get(parsed.keyId)

  if (!secret) return { status: 'unknown-key', keyId: parsed.keyId! }
  return sameDigest(digest(entry, secret), parsed.digest)
    ? { status: 'valid' }
    : { status: 'mismatch' }
}

/** Recomputa o HMAC e compara em tempo constante com o hash armazenado. */
export async function verifyEntryHash(entry: HashInput, storedHash: string): Promise<boolean> {
  return (await verifyEntryHashDetailed(entry, storedHash)).status === 'valid'
}
