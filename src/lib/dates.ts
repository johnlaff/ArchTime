import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import {
  differenceInMinutes,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TIMEZONE, DEFAULT_WORK_DAYS } from './constants'
import type { WorkMinutesByWeekday } from './preferences'

export interface DaySegment {
  date: string
  start: Date
  end: Date
  minutes: number
}

export interface ExpectedMinutesPeriod {
  startDate: string
  endDate: string
  defaultWorkHours?: number
  workDays?: number[]
  workMinutesByWeekday?: WorkMinutesByWeekday
}

export function formatBRT(date: Date | string, fmt = 'HH:mm'): string {
  return formatInTimeZone(new Date(date), TIMEZONE, fmt, { locale: ptBR })
}

export function getLocalDate(date: Date = new Date()): string {
  return getLocalDateBRT(date)
}

export function getLocalDateBRT(date: Date = new Date()): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd')
}

export function toDateOnlyUTC(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

export function startOfLocalDayBRT(date: string): Date {
  return fromZonedTime(`${date}T00:00:00`, TIMEZONE)
}

export function endExclusiveOfLocalDayBRT(date: string): Date {
  return startOfLocalDayBRT(addDaysToDateString(date, 1))
}

export function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

export function getDayOfWeek(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function getWorkingDays(
  year: number,
  month: number,
  workDays: number[] = DEFAULT_WORK_DAYS
): number {
  const start = startOfMonth(new Date(year, month - 1))
  const end = endOfMonth(start)
  return eachDayOfInterval({ start, end }).filter((d) =>
    workDays.includes(d.getDay())
  ).length
}

function easterDate(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

export function getBrazilNationalHolidays(year: number): Set<string> {
  const holidays = new Set([
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-12-25`,
    addDaysToDateString(easterDate(year), -2),
  ])

  if (year >= 2024) {
    holidays.add(`${year}-11-20`)
  }

  return holidays
}

export function calculateExpectedMinutes({
  startDate,
  endDate,
  defaultWorkHours = 8,
  workDays = DEFAULT_WORK_DAYS,
  workMinutesByWeekday,
}: ExpectedMinutesPeriod): number {
  let date = startDate
  let total = 0
  const holidaysByYear = new Map<number, Set<string>>()

  while (date <= endDate) {
    const year = Number(date.slice(0, 4))
    if (!holidaysByYear.has(year)) {
      holidaysByYear.set(year, getBrazilNationalHolidays(year))
    }
    const dayOfWeek = getDayOfWeek(date)
    if (!holidaysByYear.get(year)!.has(date)) {
      if (workMinutesByWeekday) {
        total += workMinutesByWeekday[String(dayOfWeek) as keyof WorkMinutesByWeekday]
      } else if (workDays.includes(dayOfWeek)) {
        total += Math.round(defaultWorkHours * 60)
      }
    }
    date = addDaysToDateString(date, 1)
  }

  return total
}

export function calcDurationMinutes(clockIn: Date, clockOut: Date): number {
  return differenceInMinutes(new Date(clockOut), new Date(clockIn))
}

export function splitIntervalByLocalDay(
  clockIn: Date | string,
  clockOut: Date | string
): DaySegment[] {
  const start = new Date(clockIn)
  const end = new Date(clockOut)

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return []
  }

  const segments: DaySegment[] = []
  let cursor = start

  while (cursor < end) {
    const date = getLocalDateBRT(cursor)
    const nextMidnight = endExclusiveOfLocalDayBRT(date)
    const segmentEnd = nextMidnight < end ? nextMidnight : end
    const minutes = Math.max(0, differenceInMinutes(segmentEnd, cursor))

    if (minutes > 0) {
      segments.push({
        date,
        start: cursor,
        end: segmentEnd,
        minutes,
      })
    }

    cursor = segmentEnd
  }

  return segments
}

export function parseBRTDateTimeLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const parsed = fromZonedTime(`${value}:00`, TIMEZONE)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

export function getMonthRangeBRT(month: string): {
  start: Date
  end: Date
  startDate: string
  endDate: string
} {
  const [year, monthNumber] = month.split('-').map(Number)
  const startDate = `${year.toString().padStart(4, '0')}-${monthNumber.toString().padStart(2, '0')}-01`
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7)
  const endExclusiveDate = `${nextMonth}-01`
  return {
    start: startOfLocalDayBRT(startDate),
    end: startOfLocalDayBRT(endExclusiveDate),
    startDate,
    endDate: addDaysToDateString(endExclusiveDate, -1),
  }
}

export function getWeekRangeBRT(date: Date = new Date(), weekStartDay: 0 | 1 = 1): {
  startDate: string
  endDate: string
  start: Date
  end: Date
} {
  const current = getLocalDateBRT(date)
  const day = getDayOfWeek(current)
  const daysSinceStart = weekStartDay === 1 ? (day + 6) % 7 : day
  const startDate = addDaysToDateString(current, -daysSinceStart)
  const endDate = addDaysToDateString(startDate, 6)
  return {
    startDate,
    endDate,
    start: startOfLocalDayBRT(startDate),
    end: endExclusiveOfLocalDayBRT(endDate),
  }
}

export function getWeekRangesForMonth(month: string, weekStartDay: 0 | 1 = 1): Array<{ startDate: string; endDate: string }> {
  const { startDate, endDate } = getMonthRangeBRT(month)
  const ranges: Array<{ startDate: string; endDate: string }> = []
  let cursor = startDate

  while (cursor <= endDate) {
    const day = getDayOfWeek(cursor)
    const daysUntilWeekEnd = weekStartDay === 1
      ? 6 - ((day + 6) % 7)  // Monday start → Sunday end
      : 6 - day               // Sunday start → Saturday end
    const rawEnd = addDaysToDateString(cursor, daysUntilWeekEnd)
    const rangeEnd = rawEnd > endDate ? endDate : rawEnd
    ranges.push({ startDate: cursor, endDate: rangeEnd })
    cursor = addDaysToDateString(rangeEnd, 1)
  }

  return ranges
}

export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = minutes < 0 ? '-' : ''
  return `${sign}${h}h ${m.toString().padStart(2, '0')}min`
}
