import { describe, it, expect } from 'vitest'
import { NOTES_MAX_LENGTH, parseDateOnly, parseNotes } from '@/lib/server/validation'

describe('parseNotes', () => {
  it('treats null/undefined/blank as null', () => {
    expect(parseNotes(null)).toBeNull()
    expect(parseNotes(undefined)).toBeNull()
    expect(parseNotes('')).toBeNull()
    expect(parseNotes('   ')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(parseNotes('  revisão  ')).toBe('revisão')
  })

  it('rejects non-strings with undefined (caller → 400)', () => {
    expect(parseNotes(5)).toBeUndefined()
    expect(parseNotes({})).toBeUndefined()
    expect(parseNotes(['a'])).toBeUndefined()
  })

  it('rejects notes longer than the limit', () => {
    expect(parseNotes('a'.repeat(NOTES_MAX_LENGTH))).toBe('a'.repeat(NOTES_MAX_LENGTH))
    expect(parseNotes('a'.repeat(NOTES_MAX_LENGTH + 1))).toBeUndefined()
  })
})

describe('parseDateOnly', () => {
  it('accepts a valid YYYY-MM-DD', () => {
    expect(parseDateOnly('2026-05-10')).toBe('2026-05-10')
  })

  it('rejects invalid formats and out-of-range months/days', () => {
    expect(parseDateOnly(null)).toBeNull()
    expect(parseDateOnly('2026-5-1')).toBeNull()
    expect(parseDateOnly('2026-13-01')).toBeNull()
    expect(parseDateOnly('2026-00-10')).toBeNull()
    expect(parseDateOnly('2026-05-32')).toBeNull()
    expect(parseDateOnly('abc')).toBeNull()
  })
})
