import { describe, expect, it } from 'vitest'
import {
  getSupabaseAuthCookieNames,
  isStaleRefreshTokenError,
} from '@/lib/server/supabase-session'

describe('supabase session helpers', () => {
  it('recognizes stale refresh token errors from Supabase Auth', () => {
    const error = Object.assign(
      new Error('Invalid Refresh Token: Refresh Token Not Found'),
      { code: 'refresh_token_not_found', status: 400 }
    )

    expect(isStaleRefreshTokenError(error)).toBe(true)
    expect(isStaleRefreshTokenError({ error_code: 'refresh_token_not_found' })).toBe(true)
    expect(isStaleRefreshTokenError(new Error('network timeout'))).toBe(false)
  })

  it('selects Supabase auth cookies without touching unrelated cookies', () => {
    const cookies = [
      { name: 'sb-shgpfvhkxczxwdsuhudf-auth-token', value: 'session' },
      { name: 'sb-shgpfvhkxczxwdsuhudf-auth-token.0', value: 'chunk-0' },
      { name: 'sb-shgpfvhkxczxwdsuhudf-auth-token-code-verifier', value: 'pkce' },
      { name: 'sb-shgpfvhkxczxwdsuhudf-auth-token-user', value: 'user' },
      { name: 'sb-other-project', value: 'not-auth' },
      { name: 'archtime-accent', value: 'indigo' },
    ]

    expect(getSupabaseAuthCookieNames(cookies)).toEqual([
      'sb-shgpfvhkxczxwdsuhudf-auth-token',
      'sb-shgpfvhkxczxwdsuhudf-auth-token.0',
      'sb-shgpfvhkxczxwdsuhudf-auth-token-code-verifier',
      'sb-shgpfvhkxczxwdsuhudf-auth-token-user',
    ])
  })
})
