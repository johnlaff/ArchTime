import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    clockEntry: { findMany: vi.fn() },
    hourBank: { findFirst: vi.fn(), upsert: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { buildPeriodBalance } from '../hour-bank'

const mockedPrisma = vi.mocked(prisma)
const userFindUnique = mockedPrisma.user.findUnique as unknown as Mock
const clockEntryFindMany = mockedPrisma.clockEntry.findMany as unknown as Mock

describe('buildPeriodBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userFindUnique.mockResolvedValue({ defaultWorkHours: 8 })
  })

  it('sums more than 10 sessions in the same day', async () => {
    clockEntryFindMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        clockIn: new Date(Date.UTC(2026, 1, 23, 12 + i, 0)),
        clockOut: new Date(Date.UTC(2026, 1, 23, 13 + i, 0)),
      }))
    )

    const result = await buildPeriodBalance('user-1', '2026-02-23', '2026-02-23')

    expect(result.actualMinutes).toBe(660)
    expect(result.expectedMinutes).toBe(480)
    expect(result.balanceMinutes).toBe(180)
  })

  it('filters soft-deleted entries at the query boundary', async () => {
    clockEntryFindMany.mockResolvedValue([])

    await buildPeriodBalance('user-1', '2026-02-23', '2026-02-23')

    expect(clockEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
        }),
      })
    )
  })
})
