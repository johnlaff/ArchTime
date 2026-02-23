import { describe, it, expect } from 'vitest'
import { generateEntryHash } from '../hash'

describe('generateEntryHash', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await generateEntryHash({
      clockIn: '2026-02-22T09:00:00.000Z',
      clockOut: '2026-02-22T17:00:00.000Z',
      userId: 'user-123',
      entryDate: '2026-02-22',
    })
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
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
