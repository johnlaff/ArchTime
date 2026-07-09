import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAppOrigin } from '../app-origin'

describe('resolveAppOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('usa NEXT_PUBLIC_APP_URL e ignora o origin interno do proxy (0.0.0.0:8080)', () => {
    // Atrás do App Service, request.url resolve pro binding interno do container.
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime.app')
    expect(resolveAppOrigin('http://0.0.0.0:8080')).toBe('https://archtime.app')
  })

  it('remove barra(s) final(is) da NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://archtime.app//')
    expect(resolveAppOrigin('http://0.0.0.0:8080')).toBe('https://archtime.app')
  })

  it('cai no origin da request quando NEXT_PUBLIC_APP_URL não está definida (dev/fallback)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined as unknown as string)
    expect(resolveAppOrigin('http://localhost:3000')).toBe('http://localhost:3000')
  })
})
