import { formatInTimeZone } from 'date-fns-tz'
import {
  differenceInMinutes,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TIMEZONE, DEFAULT_WORK_DAYS } from './constants'

export function formatBRT(date: Date | string, fmt = 'HH:mm'): string {
  return formatInTimeZone(new Date(date), TIMEZONE, fmt, { locale: ptBR })
}

export function getLocalDate(date: Date = new Date()): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd')
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

export function calcDurationMinutes(clockIn: Date, clockOut: Date): number {
  return differenceInMinutes(new Date(clockOut), new Date(clockIn))
}

export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = minutes < 0 ? '-' : ''
  return `${sign}${h}h ${m.toString().padStart(2, '0')}min`
}
