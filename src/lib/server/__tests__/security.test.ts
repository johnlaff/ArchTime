import type { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateMutationOrigin } from '../security'

function request(
  headers: Record<string, string> = {},
  referrer = '',
  nextUrl = 'https://archtime-live.netlify.app/api/clock'
): NextRequest {
  const headerValues = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  )

  return {
    headers: {
      get(name: string) {
        return headerValues.get(name.toLowerCase()) ?? null
      },
    },
    nextUrl: new URL(nextUrl),
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

  it('accepts a legitimate same-origin mutation in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime-live.netlify.app')

    const req = request({ origin: 'https://archtime-live.netlify.app' })
    const response = validateMutationOrigin(req)

    expect(response).toBeNull()
  })

  it('rejects a spoofed Host that does not match NEXT_PUBLIC_APP_URL in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime-live.netlify.app')

    // Host spoofado: req.nextUrl.origin = https://evil.com, com Origin casando o Host falso.
    // Antes do endurecimento, req.nextUrl.origin era confiado incondicionalmente e o ataque passava.
    const req = request({ origin: 'https://evil.com' }, '', 'https://evil.com/api/clock')
    const response = validateMutationOrigin(req)

    expect(response?.status).toBe(403)
  })
})
