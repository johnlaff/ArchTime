import { describe, it, expect } from 'vitest'
import {
  formatBRT,
  getLocalDate,
  getWorkingDays,
  calcDurationMinutes,
  formatMinutes,
} from '../dates'

describe('formatBRT', () => {
  it('formats UTC timestamp as BRT time string', () => {
    // 2026-02-22 15:00 UTC = 2026-02-22 12:00 BRT (UTC-3)
    const result = formatBRT(new Date('2026-02-22T15:00:00Z'))
    expect(result).toBe('12:00')
  })
})

describe('getLocalDate', () => {
  it('returns date string in yyyy-MM-dd format for BRT', () => {
    // Midnight UTC on Feb 23 = Feb 22 in BRT (UTC-3)
    const result = getLocalDate(new Date('2026-02-23T02:00:00Z'))
    expect(result).toBe('2026-02-22')
  })
})

describe('getWorkingDays', () => {
  it('counts weekdays in a month', () => {
    // February 2026: 28 days, starts Sunday
    // Weeks: 2 Mon–Fri + partial = 20 weekdays
    const result = getWorkingDays(2026, 2)
    expect(result).toBe(20)
  })
})

describe('calcDurationMinutes', () => {
  it('calculates difference in minutes', () => {
    const clockIn = new Date('2026-02-22T09:00:00Z')
    const clockOut = new Date('2026-02-22T17:30:00Z')
    expect(calcDurationMinutes(clockIn, clockOut)).toBe(510)
  })
})

describe('formatMinutes', () => {
  it('formats positive minutes as Xh YYmin', () => {
    expect(formatMinutes(510)).toBe('8h 30min')
  })

  it('formats zero minutes', () => {
    expect(formatMinutes(0)).toBe('0h 00min')
  })

  it('formats negative minutes with minus sign', () => {
    expect(formatMinutes(-90)).toBe('-1h 30min')
  })
})
