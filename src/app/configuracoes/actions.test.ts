import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/user-settings', () => ({
  parseSettingsPatch: vi.fn(),
  updateUserSettings: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { getAuthenticatedUser } from '@/lib/server/auth'
import { parseSettingsPatch, updateUserSettings } from '@/lib/user-settings'
import { revalidateTag } from 'next/cache'
import { saveSettings } from './actions'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const parseSettingsPatchMock = parseSettingsPatch as unknown as Mock
const updateUserSettingsMock = updateUserSettings as unknown as Mock
const revalidateTagMock = revalidateTag as unknown as Mock

// The full settings object the client passes; field values are irrelevant here
// because parseSettingsPatch is mocked.
const input = { weekStartDay: 'sunday' } as never

describe('saveSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    parseSettingsPatchMock.mockReturnValue({ weekStartDay: 'sunday' })
    updateUserSettingsMock.mockResolvedValue({ weekStartDay: 'sunday' })
  })

  it('persists settings and revalidates history + sidebar caches', async () => {
    const result = await saveSettings(input)

    expect(result).toEqual({ settings: { weekStartDay: 'sunday' } })
    expect(updateUserSettingsMock).toHaveBeenCalledWith('user-1', { weekStartDay: 'sunday' })
    expect(revalidateTagMock).toHaveBeenCalledWith('history-user-1', { expire: 0 })
    expect(revalidateTagMock).toHaveBeenCalledWith('sidebar-user-1', { expire: 0 })
  })

  it('returns an error for an invalid patch and does not revalidate', async () => {
    parseSettingsPatchMock.mockReturnValue('Dia de início de semana inválido')

    const result = await saveSettings(input)

    expect(result).toEqual({ error: 'Dia de início de semana inválido' })
    expect(updateUserSettingsMock).not.toHaveBeenCalled()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('returns an error when the user is not authenticated', async () => {
    getAuthenticatedUserMock.mockResolvedValue(null)

    const result = await saveSettings(input)

    expect(result).toEqual({ error: 'Não autenticado' })
    expect(updateUserSettingsMock).not.toHaveBeenCalled()
  })
})
