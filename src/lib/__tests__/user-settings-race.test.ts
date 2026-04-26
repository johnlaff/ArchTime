import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    clockEntry: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getOrCreateUserSettings } from '../user-settings'

const mockedPrisma = vi.mocked(prisma)
const findUnique = mockedPrisma.userSettings.findUnique as unknown as Mock
const create = mockedPrisma.userSettings.create as unknown as Mock

const existingSettings = {
  id: 'settings-1',
  userId: 'user-1',
  workMinutesByWeekday: {
    '0': 0,
    '1': 480,
    '2': 480,
    '3': 480,
    '4': 480,
    '5': 480,
    '6': 0,
  },
  workScheduleTemplate: 'standard_40h',
  showCumulativeBalance: false,
  cumulativeBalanceScope: 'since_start',
  cumulativeStartDate: new Date('2026-04-01T00:00:00.000Z'),
  accentPreset: 'indigo',
  themeMode: 'system',
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
}

describe('getOrCreateUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recovers when another request creates settings first', async () => {
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingSettings)
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      })
    )

    const settings = await getOrCreateUserSettings('user-1')

    expect(settings.accentPreset).toBe('indigo')
    expect(findUnique).toHaveBeenCalledTimes(2)
  })
})
