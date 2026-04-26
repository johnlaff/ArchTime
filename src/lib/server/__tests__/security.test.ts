import type { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateMutationOrigin } from '../security'

function request(headers: Record<string, string> = {}, referrer = ''): NextRequest {
  const headerValues = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  )

  return {
    headers: {
      get(name: string) {
        return headerValues.get(name.toLowerCase()) ?? null
      },
    },
    nextUrl: new URL('https://archtime-live.netlify.app/api/clock'),
    referrer,
  } as unknown as NextRequest
}

describe('validateMutationOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects production mutations without Origin or Referer', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime-live.netlify.app')

    const response = validateMutationOrigin(request())

    expect(response?.status).toBe(403)
  })

  it('accepts Referer as fallback when Origin is absent', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime-live.netlify.app')

    const req = request({ referer: 'https://archtime-live.netlify.app/dashboard' })
    const response = validateMutationOrigin(req)

    expect(response).toBeNull()
  })

  it('accepts Referer as fallback when Origin normalizes to null', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime-live.netlify.app')

    const req = request({
      origin: 'null',
      referer: 'https://archtime-live.netlify.app/dashboard',
    })
    const response = validateMutationOrigin(req)

    expect(response).toBeNull()
  })

  it('accepts Netlify deploy preview origins for the configured production site', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime-live.netlify.app')

    const req = request({ origin: 'https://deploy-preview-3--archtime-live.netlify.app' })
    const response = validateMutationOrigin(req)

    expect(response).toBeNull()
  })

  it('allows local requests without Origin outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')

    const response = validateMutationOrigin(request())

    expect(response).toBeNull()
  })
})
