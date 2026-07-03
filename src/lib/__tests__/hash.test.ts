import { describe, it, expect } from 'vitest'
import { generateEntryHash, verifyEntryHash } from '../hash'

describe('generateEntryHash', () => {
  it('returns an hmac-v1 hash', async () => {
    const hash = await generateEntryHash({
      clockIn: '2026-02-22T09:00:00.000Z',
      clockOut: '2026-02-22T17:00:00.000Z',
      userId: 'user-123',
      entryDate: '2026-02-22',
    })
    expect(hash).toMatch(/^hmac-v1:[0-9a-f]{64}$/)
  })

  it('produces different hashes for different inputs', async () => {
    const base = {
      clockIn: '2026-02-22T09:00:00.000Z',
      clockOut: '2026-02-22T17:00:00.000Z',
      userId: 'user-123',
      entryDate: '2026-02-22',
    }
    const hash1 = await generateEntryHash(base)
    const hash2 = await generateEntryHash({ ...base, clockOut: '2026-02-22T18:00:00.000Z' })
    expect(hash1).not.toBe(hash2)
  })
})

describe('verifyEntryHash', () => {
  const entry = {
    clockIn: '2026-02-22T09:00:00.000Z',
    clockOut: '2026-02-22T17:00:00.000Z',
    userId: 'user-123',
    entryDate: '2026-02-22',
  }

  it('returns true for a hash that round-trips from generateEntryHash', async () => {
    const hash = await generateEntryHash(entry)
    await expect(verifyEntryHash(entry, hash)).resolves.toBe(true)
  })

  it('returns false when a field changed (clockOut +1min)', async () => {
    const hash = await generateEntryHash(entry)
    const tampered = { ...entry, clockOut: '2026-02-22T17:01:00.000Z' }
    await expect(verifyEntryHash(tampered, hash)).resolves.toBe(false)
  })

  it('returns false without throwing when the stored hash has a different length', async () => {
    await expect(verifyEntryHash(entry, 'hmac-v1:deadbeef')).resolves.toBe(false)
  })
})
