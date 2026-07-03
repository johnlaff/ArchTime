import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { cookies } from 'next/headers'
import { GET } from './route'

const cookiesMock = cookies as unknown as Mock

function withCookie(value: string | null) {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === 'archtime-accent-color' && value !== null ? { name, value } : undefined,
  })
}

function request(query = '') {
  return new NextRequest(`https://archtime-live.netlify.app/manifest.json${query}`)
}

describe('/manifest.json', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCookie(null)
  })

  it('prioriza a cor do query param sobre o cookie', async () => {
    withCookie('#2d7a4f')
    const response = await GET(request('?color=%23f43f5e'))
    const body = await response.json()

    expect(body.theme_color).toBe('#f43f5e')
    expect(body.icons).toHaveLength(4)
    for (const icon of body.icons) {
      expect(icon.src).toContain('color=%23f43f5e')
    }
  })

  it('cai para o cookie de accent quando não há query param', async () => {
    withCookie('#2d7a4f')
    const body = await (await GET(request())).json()

    expect(body.theme_color).toBe('#2d7a4f')
    expect(body.icons[0].src).toContain('color=%232d7a4f')
  })

  it('usa o indigo padrão sem query param nem cookie (e ignora cor inválida)', async () => {
    const body = await (await GET(request('?color=vermelho'))).json()

    expect(body.theme_color).toBe('#6366f1')
    expect(body.icons[0].src).toContain('color=%236366f1')
  })

  it('mantém os campos de instalação e headers sem cache', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.headers.get('Content-Type')).toBe('application/manifest+json')
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0')
    expect(body.start_url).toBe('/dashboard')
    expect(body.display).toBe('standalone')
    expect(body.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes}/${icon.purpose}`)).toEqual([
      '192x192/any',
      '192x192/maskable',
      '512x512/any',
      '512x512/maskable',
    ])
  })
})
