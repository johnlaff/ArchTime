import { describe, expect, it } from 'vitest'
import { getOAuthRedirectTo } from '../oauth-redirect'

describe('getOAuthRedirectTo', () => {
  it('uses the current deployment origin for auth callbacks', () => {
    expect(getOAuthRedirectTo('https://deploy-preview-3--archtime-live.netlify.app')).toBe(
      'https://deploy-preview-3--archtime-live.netlify.app/auth/callback'
    )
  })

  it('normalizes trailing slashes from origins', () => {
    expect(getOAuthRedirectTo('https://archtime-live.netlify.app/')).toBe(
      'https://archtime-live.netlify.app/auth/callback'
    )
  })
})
