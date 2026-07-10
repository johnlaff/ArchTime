import { NextRequest, NextResponse } from 'next/server'

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value || value === 'about:client') return null
  try {
    const origin = new URL(value).origin
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function isSameNetlifySitePreview(origin: string, appOrigin: string | null): boolean {
  if (!appOrigin) return false
  try {
    const originHost = new URL(origin).hostname
    const appHost = new URL(appOrigin).hostname
    return (
      appHost.endsWith('.netlify.app') &&
      originHost.endsWith(`--${appHost}`) &&
      originHost.startsWith('deploy-preview-')
    )
  } catch {
    return false
  }
}

export function validateMutationOrigin(req: NextRequest): NextResponse | null {
  const originHeader = req.headers.get('origin')
  const origin = normalizeOrigin(originHeader)
  const refererHeader = req.headers.get('referer') ?? req.headers.get('referrer') ?? req.referrer
  const referer = origin ? null : normalizeOrigin(refererHeader)
  const requestOrigin = origin ?? referer

  const allowed = new Set<string>()
  const appOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (appOrigin) allowed.add(appOrigin)

  // req.nextUrl.origin deriva do header Host, que só é confiável quando a infra o
  // saneia (o App Service roteia por hostname e rejeita Host não-configurado). Só confie nele sozinho quando casa com
  // NEXT_PUBLIC_APP_URL ou é um origin local (dev) — nunca incondicionalmente, senão
  // um Host spoofado (Host: evil.com) passaria no check de CSRF. Ver ADR 0004.
  const nextUrlOrigin = normalizeOrigin(req.nextUrl.origin)
  if (nextUrlOrigin) {
    if (appOrigin && nextUrlOrigin === appOrigin) {
      allowed.add(nextUrlOrigin)
    } else if (process.env.NODE_ENV !== 'production' && isLocalOrigin(nextUrlOrigin)) {
      allowed.add(nextUrlOrigin)
    }
  }

  if (requestOrigin && allowed.has(requestOrigin)) return null
  if (requestOrigin && isSameNetlifySitePreview(requestOrigin, appOrigin)) return null
  if (requestOrigin && process.env.NODE_ENV !== 'production' && isLocalOrigin(requestOrigin)) {
    return null
  }
  if (!requestOrigin && process.env.NODE_ENV !== 'production') return null

  return NextResponse.json({ error: 'Origin não permitido' }, { status: 403 })
}
