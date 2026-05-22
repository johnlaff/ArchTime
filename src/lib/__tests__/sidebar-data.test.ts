import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}))

const { fetchActiveProjects, fetchWeekComparison } = await import('../server/sidebar-data')
const { prisma } = await import('@/lib/prisma')

describe('fetchActiveProjects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps snake_case DB columns to camelCase', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { id: 'p1', name: 'Torre Alpha', color: '#6366f1', month_minutes: 120 },
    ])

    const result = await fetchActiveProjects('user-1')

    expect(result).toEqual([
      { id: 'p1', name: 'Torre Alpha', color: '#6366f1', monthMinutes: 120 },
    ])
  })

  it('returns empty array when no active projects', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    expect(await fetchActiveProjects('user-1')).toEqual([])
  })
})

describe('fetchWeekComparison', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps columns and computes deltaPercent', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { this_week_minutes: 1800, last_week_minutes: 1500, delta_minutes: 300 },
    ])

    const result = await fetchWeekComparison('user-1')

    expect(result).toEqual({
      thisWeekMinutes: 1800,
      lastWeekMinutes: 1500,
      deltaMinutes: 300,
      deltaPercent: 20,
    })
  })

  it('returns deltaPercent null when last week was zero', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { this_week_minutes: 600, last_week_minutes: 0, delta_minutes: 600 },
    ])

    const result = await fetchWeekComparison('user-1')
    expect(result.deltaPercent).toBeNull()
  })

  it('returns zeros when no data exists', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    const result = await fetchWeekComparison('user-1')
    expect(result).toEqual({ thisWeekMinutes: 0, lastWeekMinutes: 0, deltaMinutes: 0, deltaPercent: null })
  })
})
