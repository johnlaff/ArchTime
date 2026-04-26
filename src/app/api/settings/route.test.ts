import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/user-settings', () => ({
  getOrCreateUserSettings: vi.fn(),
  parseSettingsPatch: vi.fn(),
  settingsOptions: {
    workScheduleTemplates: {},
    cumulativeBalanceScopes: {},
    accentPresets: {},
    themeModes: ['system', 'light', 'dark'],
  },
  updateUserSettings: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import {
  getOrCreateUserSettings,
  parseSettingsPatch,
  updateUserSettings,
} from '@/lib/user-settings'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { GET, PATCH } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const getOrCreateUserSettingsMock = getOrCreateUserSettings as unknown as Mock
const parseSettingsPatchMock = parseSettingsPatch as unknown as Mock
const updateUserSettingsMock = updateUserSettings as unknown as Mock

describe('/api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    getOrCreateUserSettingsMock.mockResolvedValue({ accentPreset: 'indigo' })
    parseSettingsPatchMock.mockReturnValue({ showCumulativeBalance: true })
    updateUserSettingsMock.mockResolvedValue({ showCumulativeBalance: true })
  })

  it('returns default settings for the authenticated user', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(getOrCreateUserSettingsMock).toHaveBeenCalledWith('user-1')
    expect(body.settings).toEqual({ accentPreset: 'indigo' })
  })

  it('patches only the authenticated user settings', async () => {
    const response = await PATCH(
      new NextRequest('https://archtime-live.netlify.app/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ showCumulativeBalance: true }),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(200)
    expect(parseSettingsPatchMock).toHaveBeenCalledWith({ showCumulativeBalance: true })
    expect(updateUserSettingsMock).toHaveBeenCalledWith('user-1', {
      showCumulativeBalance: true,
    })
  })

  it('returns 400 for invalid settings payloads', async () => {
    parseSettingsPatchMock.mockReturnValue('Tema inválido')

    const response = await PATCH(
      new NextRequest('https://archtime-live.netlify.app/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ themeMode: 'sepia' }),
        headers: { 'content-type': 'application/json' },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Tema inválido')
  })
})
