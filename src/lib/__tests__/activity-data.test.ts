import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { clockEntry: { findMany: vi.fn() } },
}))

const { fetchHeatmapDays, fetchWeekMinutes } = await import('../server/activity-data')
const { prisma } = await import('@/lib/prisma')
const findMany = vi.mocked(prisma.clockEntry).findMany as unknown as ReturnType<typeof vi.fn>

// UTC = BRT + 3h (America/Sao_Paulo, sem horário de verão). Um segmento em BRT das HH:MM
// vira HH+3:MM em UTC. "Hoje" fixado em 2026-07-09 (quinta); a semana Mon-start começa 2026-07-06.
function heatmapEntry(clockIn: string, clockOut: string, projectName: string | null = null) {
  return {
    id: `e-${clockIn}`,
    clockIn: new Date(clockIn),
    clockOut: new Date(clockOut),
    allocations: projectName ? [{ project: { name: projectName } }] : [],
  }
}

describe('activity-data aggregation pipelines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-09T15:00:00.000Z')) // 12:00 BRT, quinta
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('fetchHeatmapDays', () => {
    it('splits an entry crossing BRT midnight into two day buckets', async () => {
      // 23:00 07-07 BRT → 01:00 07-08 BRT
      findMany.mockResolvedValue([
        heatmapEntry('2026-07-08T02:00:00.000Z', '2026-07-08T04:00:00.000Z', 'Projeto X'),
      ])

      const days = await fetchHeatmapDays('user-1')

      expect(days.find((d) => d.date === '2026-07-07')?.totalMinutes).toBe(60)
      expect(days.find((d) => d.date === '2026-07-08')?.totalMinutes).toBe(60)
      expect(days.find((d) => d.date === '2026-07-07')?.sessionCount).toBe(1)
    })

    it('zero-fills days with no activity and ends on today', async () => {
      findMany.mockResolvedValue([])

      const days = await fetchHeatmapDays('user-1')

      expect(days.find((d) => d.date === '2026-07-01')).toEqual({
        date: '2026-07-01',
        totalMinutes: 0,
        sessionCount: 0,
        topProject: null,
      })
      expect(days[0].date).toBe('2025-08-01') // janela do Ano: 12 meses terminando no mês vigente
      expect(days[days.length - 1].date).toBe('2026-07-09') // hoje
    })

    it('picks the project with the most minutes as topProject', async () => {
      findMany.mockResolvedValue([
        heatmapEntry('2026-07-05T12:00:00.000Z', '2026-07-05T14:00:00.000Z', 'Projeto A'), // 120min
        heatmapEntry('2026-07-05T17:00:00.000Z', '2026-07-05T18:00:00.000Z', 'Projeto B'), // 60min
      ])

      const day = (await fetchHeatmapDays('user-1')).find((d) => d.date === '2026-07-05')

      expect(day?.totalMinutes).toBe(180)
      expect(day?.topProject).toBe('Projeto A')
    })

    it('keeps the first-inserted project on a topProject tie (documents current behavior)', async () => {
      // Empate de minutos: o `>` estrito em topProjectOf mantém o primeiro inserido.
      findMany.mockResolvedValue([
        heatmapEntry('2026-07-06T12:00:00.000Z', '2026-07-06T13:00:00.000Z', 'Projeto A'), // 60min
        heatmapEntry('2026-07-06T14:00:00.000Z', '2026-07-06T15:00:00.000Z', 'Projeto B'), // 60min
      ])

      const day = (await fetchHeatmapDays('user-1')).find((d) => d.date === '2026-07-06')

      expect(day?.topProject).toBe('Projeto A')
    })
  })

  describe('fetchWeekMinutes', () => {
    it('buckets a mid-week entry on its day and zero-fills the rest of the 7-day week', async () => {
      // Quarta 2026-07-08, 09:00–11:00 BRT (120min)
      findMany.mockResolvedValue([
        { clockIn: new Date('2026-07-08T12:00:00.000Z'), clockOut: new Date('2026-07-08T14:00:00.000Z') },
      ])

      const out = await fetchWeekMinutes('user-1', 1) // Monday start

      expect(out).toHaveLength(7)
      expect(out[0].date).toBe('2026-07-06') // segunda
      expect(out.find((d) => d.date === '2026-07-08')?.totalMinutes).toBe(120)
      expect(out.find((d) => d.date === '2026-07-06')?.totalMinutes).toBe(0)
    })

    it('splits a week entry crossing BRT midnight across two days', async () => {
      // 23:00 07-07 BRT → 01:00 07-08 BRT
      findMany.mockResolvedValue([
        { clockIn: new Date('2026-07-08T02:00:00.000Z'), clockOut: new Date('2026-07-08T04:00:00.000Z') },
      ])

      const out = await fetchWeekMinutes('user-1', 1)

      expect(out.find((d) => d.date === '2026-07-07')?.totalMinutes).toBe(60)
      expect(out.find((d) => d.date === '2026-07-08')?.totalMinutes).toBe(60)
    })
  })
})
