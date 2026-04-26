import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/hour-bank', () => ({
  buildHourBankMonth: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { buildHourBankMonth } from '@/lib/hour-bank'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { GET } from './route'

const buildHourBankMonthMock = buildHourBankMonth as unknown as Mock
const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock

describe('GET /api/hour-bank', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    buildHourBankMonthMock.mockResolvedValue({
      month: '2026-04',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      expectedMinutes: 9600,
      actualMinutes: 9000,
      balanceMinutes: -600,
      cumulativeBalance: -600,
      weeks: [],
    })
  })

  it('calculates hour bank without persisting from a GET request', async () => {
    const response = await GET(
      new NextRequest('https://archtime-live.netlify.app/api/hour-bank?month=2026-04')
    )

    expect(response.status).toBe(200)
    expect(buildHourBankMonthMock).toHaveBeenCalledWith(
      'user-1',
      '2026-04',
      { persist: false }
    )
  })
})
