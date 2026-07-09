import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userSettings: { findUnique: vi.fn(), create: vi.fn() },
    clockEntry: { findMany: vi.fn() },
    hourBank: { findFirst: vi.fn(), upsert: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { buildHourBankMonth, buildPeriodBalanceFromEntries } from '../hour-bank'
import type { SerializedUserSettings } from '../user-settings'

const mockedPrisma = vi.mocked(prisma)
const userFindUnique = mockedPrisma.user.findUnique as unknown as Mock
const userSettingsFindUnique = mockedPrisma.userSettings.findUnique as unknown as Mock
const clockEntryFindMany = mockedPrisma.clockEntry.findMany as unknown as Mock

const standardSettings: SerializedUserSettings = {
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
  cumulativeStartDate: '2026-02-01',
  accentPreset: 'indigo',
  themeMode: 'system',
  weekStartDay: 'monday',
  architecturalPreset: null,
  density: 'cozy',
  customAccentColor: null,
}

describe('buildPeriodBalanceFromEntries', () => {
  it('sums more than 10 sessions in the same day', () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({
      clockIn: new Date(Date.UTC(2026, 1, 23, 12 + i, 0)),
      clockOut: new Date(Date.UTC(2026, 1, 23, 13 + i, 0)),
    }))

    const result = buildPeriodBalanceFromEntries(
      entries,
      '2026-02-23',
      '2026-02-23',
      standardSettings.workMinutesByWeekday
    )

    expect(result.actualMinutes).toBe(660)
    expect(result.expectedMinutes).toBe(480)
    expect(result.balanceMinutes).toBe(180)
  })
})

describe('buildHourBankMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userFindUnique.mockResolvedValue({ defaultWorkHours: 8 })
    userSettingsFindUnique.mockResolvedValue({
      id: 'settings-1',
      userId: 'user-1',
      workMinutesByWeekday: standardSettings.workMinutesByWeekday,
      workScheduleTemplate: standardSettings.workScheduleTemplate,
      showCumulativeBalance: standardSettings.showCumulativeBalance,
      cumulativeBalanceScope: standardSettings.cumulativeBalanceScope,
      cumulativeStartDate: new Date('2026-02-01T00:00:00.000Z'),
      accentPreset: standardSettings.accentPreset,
      themeMode: standardSettings.themeMode,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    })
  })

  it('filters soft-deleted entries at the query boundary', async () => {
    clockEntryFindMany.mockResolvedValue([])

    await buildHourBankMonth('user-1', '2026-02')

    expect(clockEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
        }),
      })
    )
  })

  it('returns null cumulative balance when cumulative display is disabled', async () => {
    clockEntryFindMany.mockResolvedValue([
      {
        clockIn: new Date('2026-02-02T12:00:00.000Z'),
        clockOut: new Date('2026-02-02T13:00:00.000Z'),
      },
    ])

    const result = await buildHourBankMonth('user-1', '2026-02')

    expect(result.expectedMinutes).toBe(9600)
    expect(result.actualMinutes).toBe(60)
    expect(result.cumulativeBalance).toBeNull()
    expect(result.showCumulativeBalance).toBe(false)
    expect(clockEntryFindMany).toHaveBeenCalledTimes(1)
  })

  it('uses the selected rolling cumulative window when cumulative display is enabled', async () => {
    userSettingsFindUnique.mockResolvedValue({
      id: 'settings-1',
      userId: 'user-1',
      workMinutesByWeekday: standardSettings.workMinutesByWeekday,
      workScheduleTemplate: standardSettings.workScheduleTemplate,
      showCumulativeBalance: true,
      cumulativeBalanceScope: 'rolling_3_months',
      cumulativeStartDate: new Date('2026-01-01T00:00:00.000Z'),
      accentPreset: standardSettings.accentPreset,
      themeMode: standardSettings.themeMode,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    clockEntryFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await buildHourBankMonth('user-1', '2026-04')

    expect(result.cumulativeBalance).not.toBeNull()
    expect(clockEntryFindMany).toHaveBeenCalledTimes(2)
    expect(clockEntryFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          clockOut: expect.objectContaining({
            gt: new Date('2026-02-01T03:00:00.000Z'),
          }),
        }),
      })
    )
  })

  it('skips week computation when computeWeeks is false', async () => {
    clockEntryFindMany.mockResolvedValue([])

    const result = await buildHourBankMonth('user-1', '2026-02', { computeWeeks: false })

    expect(result.weeks).toEqual([])
  })

  it('uses provided cumulativeEntries instead of a second query', async () => {
    userSettingsFindUnique.mockResolvedValue({
      id: 'settings-1',
      userId: 'user-1',
      workMinutesByWeekday: standardSettings.workMinutesByWeekday,
      workScheduleTemplate: standardSettings.workScheduleTemplate,
      showCumulativeBalance: true,
      cumulativeBalanceScope: 'rolling_3_months',
      cumulativeStartDate: new Date('2026-01-01T00:00:00.000Z'),
      accentPreset: standardSettings.accentPreset,
      themeMode: standardSettings.themeMode,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    clockEntryFindMany.mockResolvedValue([])

    const result = await buildHourBankMonth('user-1', '2026-04', { cumulativeEntries: [] })

    expect(result.cumulativeBalance).not.toBeNull()
    // Só a query do mês roda; o acumulado usa as entries fornecidas (sem 2º fetch).
    expect(clockEntryFindMany).toHaveBeenCalledTimes(1)
  })
})
