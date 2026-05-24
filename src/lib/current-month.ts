import { getLocalDateBRT } from '@/lib/dates'

export function getCurrentMonth(date: Date = new Date()): string {
  return getLocalDateBRT(date).slice(0, 7)
}
