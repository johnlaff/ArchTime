import { describe, it, expect } from 'vitest'
import {
  formatBRT,
  getLocalDate,
  getWorkingDays,
  calcDurationMinutes,
  calculateExpectedMinutes,
  formatMinutes,
  getBrazilNationalHolidays,
  splitIntervalByLocalDay,
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

describe('splitIntervalByLocalDay', () => {
  it('splits a 23:00-01:00 session by BRT day', () => {
    const segments = splitIntervalByLocalDay(
      new Date('2026-02-23T02:00:00Z'),
      new Date('2026-02-23T04:00:00Z')
    )
    expect(segments.map((s) => [s.date, s.minutes])).toEqual([
      ['2026-02-22', 60],
      ['2026-02-23', 60],
    ])
  })

  it('splits a session crossing month boundary', () => {
    const segments = splitIntervalByLocalDay(
      new Date('2026-03-01T02:00:00Z'),
      new Date('2026-03-01T04:00:00Z')
    )
    expect(segments.map((s) => [s.date, s.minutes])).toEqual([
      ['2026-02-28', 60],
      ['2026-03-01', 60],
    ])
  })
})

describe('Brazilian national holidays', () => {
  it('includes official national holidays and Good Friday', () => {
    const holidays = getBrazilNationalHolidays(2026)
    expect(holidays.has('2026-04-03')).toBe(true)
    expect(holidays.has('2026-04-21')).toBe(true)
    expect(holidays.has('2026-11-20')).toBe(true)
  })

  it('discounts national holidays from expected minutes', () => {
    const expected = calculateExpectedMinutes({
      startDate: '2026-04-20',
      endDate: '2026-04-21',
      defaultWorkHours: 8,
    })
    expect(expected).toBe(480)
  })

  it('uses configured weekday minutes instead of a fixed 8h workday', () => {
    const expected = calculateExpectedMinutes({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      workMinutesByWeekday: {
        '0': 0,
        '1': 360,
        '2': 360,
        '3': 360,
        '4': 360,
        '5': 360,
        '6': 0,
      },
    })

    expect(expected).toBe(7200)
  })

  it('keeps national holidays discounted when weekday minutes are customized', () => {
    const expected = calculateExpectedMinutes({
      startDate: '2026-04-20',
      endDate: '2026-04-21',
      workMinutesByWeekday: {
        '0': 0,
        '1': 300,
        '2': 300,
        '3': 300,
        '4': 300,
        '5': 300,
        '6': 0,
      },
    })

    expect(expected).toBe(300)
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
