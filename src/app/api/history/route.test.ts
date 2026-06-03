import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/history', () => ({
  buildHistoryBundle: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { buildHistoryBundle } from '@/lib/history'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { GET } from './route'

const buildHistoryBundleMock = buildHistoryBundle as unknown as Mock
const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock

describe('GET /api/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    buildHistoryBundleMock.mockResolvedValue({
      history: { entries: [], totalMinutes: 0, sessionCount: 0, page: 2, pageSize: 25, hasMore: false },
      projects: [],
      hourBank: { month: '2026-04' },
      settings: { accentPreset: 'indigo' },
    })
  })

  it('returns 401 when the user is not authenticated', async () => {
    getAuthenticatedUserMock.mockResolvedValue(null)

    const response = await GET(
      new NextRequest('https://archtime-live.netlify.app/api/history?month=2026-04')
    )

    expect(response.status).toBe(401)
    expect(buildHistoryBundleMock).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid month values', async () => {
    const response = await GET(
      new NextRequest('https://archtime-live.netlify.app/api/history?month=abc')
    )

    expect(response.status).toBe(400)
    expect(buildHistoryBundleMock).not.toHaveBeenCalled()
  })

  it('returns a bundled history response with parsed pagination', async () => {
    const response = await GET(
      new NextRequest('https://archtime-live.netlify.app/api/history?month=2026-04&page=2&pageSize=25')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(buildHistoryBundleMock).toHaveBeenCalledWith('user-1', '2026-04', 2, 25, {
      q: undefined,
      projectId: undefined,
      activityType: undefined,
      dateStart: undefined,
      dateEnd: undefined,
    })
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=60, stale-while-revalidate=300')
    expect(response.headers.get('Vary')).toBe('Cookie')
    expect(body.history.page).toBe(2)
    expect(console.info).not.toHaveBeenCalled()
  })
})
