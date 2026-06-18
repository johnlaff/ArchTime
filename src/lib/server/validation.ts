import { calcDurationMinutes, getLocalDateBRT, parseBRTDateTimeLocal } from '@/lib/dates'

const MAX_SESSION_MINUTES = 24 * 60
export const NOTES_MAX_LENGTH = 1000
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Normaliza notas de sessão (texto livre opcional):
 * - `null`/`''`/ausente → `null`
 * - string dentro do limite → texto aparado (ou `null` se só espaços)
 * - não-string ou acima do limite → `undefined` (chamador → 400)
 */
export function parseNotes(value: unknown): string | null | undefined {
  if (value == null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > NOTES_MAX_LENGTH) return undefined
  return trimmed
}

/** Valida uma data YYYY-MM-DD (calendário-válida o suficiente para filtro). */
export function parseDateOnly(value: string | null): string | null {
  if (!value) return null
  return DATE_RE.test(value) ? value : null
}

export function parseMonth(value: string | null, fallback = new Date()): string | null {
  const month = value ?? getLocalDateBRT(fallback).slice(0, 7)
  return MONTH_RE.test(month) ? month : null
}

export function parsePage(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export function normalizeHexColor(value: unknown, fallback = '#6366f1'): string | null {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string' || !HEX_RE.test(value)) return null
  return value.toLowerCase()
}

export function normalizeHourlyRate(value: unknown): number | null | undefined {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

export function parseIsoTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

export function parseClockDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  return parseBRTDateTimeLocal(value) ?? parseIsoTimestamp(value)
}

export function validateClosedRange(
  clockIn: Date,
  clockOut: Date,
  options: { allowLongSession?: boolean; now?: Date } = {}
): string | null {
  const now = options.now ?? new Date()

  if (!Number.isFinite(clockIn.getTime()) || !Number.isFinite(clockOut.getTime())) {
    return 'Timestamp inválido'
  }
  if (clockOut <= clockIn) {
    return 'Horário de saída deve ser posterior ao de entrada'
  }
  if (clockIn.getTime() > now.getTime() + FUTURE_TOLERANCE_MS || clockOut.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return 'Horário não pode estar no futuro'
  }
  if (!options.allowLongSession && calcDurationMinutes(clockIn, clockOut) > MAX_SESSION_MINUTES) {
    return 'Sessões acima de 24h precisam ser corrigidas manualmente no Histórico'
  }

  return null
}

export function safeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
