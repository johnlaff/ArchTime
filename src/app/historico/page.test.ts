import { describe, expect, it } from 'vitest'
import { getCurrentMonth } from '@/lib/current-month'

describe('HistoricoPage month selection', () => {
  it('computes the initial month in the app timezone', () => {
    expect(getCurrentMonth(new Date('2026-06-01T02:30:00.000Z'))).toBe('2026-05')
  })
})
