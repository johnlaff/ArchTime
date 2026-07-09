import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { clockEntry: { findMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { buildHistoryData } from '../history'

const clockEntryFindMany = vi.mocked(prisma.clockEntry).findMany as unknown as Mock

// UTC = BRT + 3h. Um segmento em BRT das HH:MM vira HH+3:MM em UTC.
function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    clockIn: new Date('2026-07-05T12:00:00.000Z'),
    clockOut: new Date('2026-07-05T14:00:00.000Z'),
    totalMinutes: 120,
    activityType: null,
    notes: null,
    source: 'web',
    allocations: [],
    ...overrides,
  }
}

describe('buildHistoryData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('splits an entry crossing BRT midnight into two segments (desc by date)', async () => {
    // 23:00 07-07 BRT → 01:00 07-08 BRT
    clockEntryFindMany.mockResolvedValue([
      makeEntry({
        clockIn: new Date('2026-07-08T02:00:00.000Z'),
        clockOut: new Date('2026-07-08T04:00:00.000Z'),
        totalMinutes: 120,
      }),
    ])

    const { history } = await buildHistoryData('user-1', '2026-07')

    expect(history.entries.map((e) => [e.segmentDate, e.segmentMinutes])).toEqual([
      ['2026-07-08', 60],
      ['2026-07-07', 60],
    ])
    expect(history.entries.every((e) => e.isPartial)).toBe(true)
    expect(history.totalMinutes).toBe(120)
  })

  it('sums only in-month segment minutes for an entry crossing into the next month', async () => {
    // 23:00 07-31 BRT → 01:00 08-01 BRT: só o segmento de julho conta.
    clockEntryFindMany.mockResolvedValue([
      makeEntry({
        clockIn: new Date('2026-08-01T02:00:00.000Z'),
        clockOut: new Date('2026-08-01T04:00:00.000Z'),
        totalMinutes: 120,
      }),
    ])

    const { history } = await buildHistoryData('user-1', '2026-07')

    expect(history.entries).toHaveLength(1)
    expect(history.entries[0].segmentDate).toBe('2026-07-31')
    expect(history.entries[0].segmentMinutes).toBe(60)
    expect(history.totalMinutes).toBe(60) // não 120 (totalEntryMinutes)
  })

  it('sets hasMore when there are more segments than the page size', async () => {
    const entries = Array.from({ length: 4 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        clockIn: new Date(`2026-07-0${i + 1}T12:00:00.000Z`),
        clockOut: new Date(`2026-07-0${i + 1}T13:00:00.000Z`),
        totalMinutes: 60,
      })
    )
    clockEntryFindMany.mockResolvedValue(entries)

    const { history } = await buildHistoryData('user-1', '2026-07', 1, 3)

    expect(history.entries).toHaveLength(3)
    expect(history.hasMore).toBe(true)
    expect(history.sessionCount).toBe(4)
  })

  it('drops a sub-2-minute session straddling midnight (characterization — see plans/README.md rejected edge case)', async () => {
    // 23:59:30 BRT → 00:00:40 BRT: 70s total (totalMinutes floored to 1), mas cada lado da
    // meia-noite tem < 60s, então splitIntervalByLocalDay descarta ambos os segmentos (floor 0).
    // Resultado: a sessão some do histórico. Trava esse comportamento — se splitIntervalByLocalDay
    // mudar para emitir segmentos sub-1min, este teste falha e força a decisão explícita.
    clockEntryFindMany.mockResolvedValue([
      makeEntry({
        clockIn: new Date('2026-07-09T02:59:30.000Z'),
        clockOut: new Date('2026-07-09T03:00:40.000Z'),
        totalMinutes: 1,
      }),
    ])

    const { history } = await buildHistoryData('user-1', '2026-07')

    expect(history.entries).toHaveLength(0)
    expect(history.totalMinutes).toBe(0)
  })
})
