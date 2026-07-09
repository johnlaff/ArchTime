import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAllowedEmail } from '../auth'

const ORIGINAL = process.env.ALLOWED_EMAILS

afterEach(() => {
  vi.unstubAllEnvs()
  if (ORIGINAL === undefined) delete process.env.ALLOWED_EMAILS
  else process.env.ALLOWED_EMAILS = ORIGINAL
})

describe('isAllowedEmail', () => {
  it('returns false for null/undefined/empty email', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail(null)).toBe(false)
    expect(isAllowedEmail(undefined)).toBe(false)
    expect(isAllowedEmail('')).toBe(false)
  })

  it('returns false when ALLOWED_EMAILS is empty or unset', () => {
    vi.stubEnv('ALLOWED_EMAILS', '')
    expect(isAllowedEmail('john@example.com')).toBe(false)
    vi.stubEnv('ALLOWED_EMAILS', undefined as unknown as string)
    expect(isAllowedEmail('john@example.com')).toBe(false)
  })

  it('allows an email in the list', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail('john@example.com')).toBe(true)
  })

  it('allows an email in a comma-separated list with surrounding whitespace', () => {
    vi.stubEnv('ALLOWED_EMAILS', ' giordanna@example.com , john@example.com ')
    expect(isAllowedEmail('john@example.com')).toBe(true)
    expect(isAllowedEmail('giordanna@example.com')).toBe(true)
  })

  it('ignores empty entries from trailing/double commas', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com,,')
    expect(isAllowedEmail('john@example.com')).toBe(true)
    expect(isAllowedEmail('')).toBe(false)
  })

  it('rejects an email not in the list', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail('intruso@example.com')).toBe(false)
  })

  it('is case-sensitive (documents current behavior)', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail('John@example.com')).toBe(false)
    expect(isAllowedEmail('JOHN@EXAMPLE.COM')).toBe(false)
  })
})
