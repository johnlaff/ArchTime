import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// We exercise the REAL safeRecalculateHourBankForInterval (not a mock) so its
// try/catch contract is what's under test: a rejection inside the underlying
// recalculateHourBankForInterval must be swallowed, never re-thrown. Only the
// leaf dependencies (prisma + settings) are mocked.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clockEntry: { findMany: vi.fn() },
    hourBank: { findFirst: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/user-settings', () => ({
  getOrCreateUserSettings: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getOrCreateUserSettings } from '@/lib/user-settings'
import type { SerializedUserSettings } from '@/lib/user-settings'
import { safeRecalculateHourBankForInterval } from '../hour-bank'

const getOrCreateUserSettingsMock = getOrCreateUserSettings as unknown as Mock
const clockEntryFindManyMock = prisma.clockEntry.findMany as unknown as Mock
const hourBankUpsertMock = prisma.hourBank.upsert as unknown as Mock

const standardSettings: SerializedUserSettings = {
  workMinutesByWeekday: { '0': 0, '1': 480, '2': 480, '3': 480, '4': 480, '5': 480, '6': 0 },
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

const clockIn = new Date('2026-04-20T09:00:00.000Z')
const clockOut = new Date('2026-04-20T12:00:00.000Z')

describe('safeRecalculateHourBankForInterval', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('swallows a rejection from the recalc and logs instead of throwing', async () => {
    getOrCreateUserSettingsMock.mockRejectedValue(new Error('db down'))

    await expect(
      safeRecalculateHourBankForInterval('user-1', clockIn, clockOut)
    ).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[hour-bank] recálculo falhou (mutação primária já commitada)',
      expect.objectContaining({
        userId: 'user-1',
        clockIn: clockIn.toISOString(),
        clockOut: clockOut.toISOString(),
        error: expect.any(Error),
      })
    )
  })

  it('resolves without logging when the recalc succeeds', async () => {
    getOrCreateUserSettingsMock.mockResolvedValue(standardSettings)
    clockEntryFindManyMock.mockResolvedValue([])
    hourBankUpsertMock.mockResolvedValue({})

    await expect(
      safeRecalculateHourBankForInterval('user-1', clockIn, clockOut)
    ).resolves.toBeUndefined()

    expect(hourBankUpsertMock).toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
