import { describe, expect, it } from 'vitest'
import { HistoryAuthError, parseHistoryBundleResponse } from '../history-client'

describe('parseHistoryBundleResponse', () => {
  it('throws an auth error for unauthorized history bundle responses', async () => {
    await expect(
      parseHistoryBundleResponse(new Response(null, { status: 401 }))
    ).rejects.toBeInstanceOf(HistoryAuthError)

    await expect(
      parseHistoryBundleResponse(new Response(null, { status: 403 }))
    ).rejects.toBeInstanceOf(HistoryAuthError)
  })

  it('returns the history bundle body for successful responses', async () => {
    const body = { history: { entries: [] }, projects: [], hourBank: {}, settings: {} }

    await expect(
      parseHistoryBundleResponse(Response.json(body))
    ).resolves.toEqual(body)
  })
})
