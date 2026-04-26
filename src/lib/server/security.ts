import { NextRequest, NextResponse } from 'next/server'

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
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

export function validateMutationOrigin(req: NextRequest): NextResponse | null {
  const origin = normalizeOrigin(req.headers.get('origin'))
  if (!origin) return null

  const allowed = new Set<string>()
  const appOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (appOrigin) allowed.add(appOrigin)
  allowed.add(req.nextUrl.origin)

  if (allowed.has(origin)) return null
  if (process.env.NODE_ENV !== 'production' && isLocalOrigin(origin)) return null

  return NextResponse.json({ error: 'Origin não permitido' }, { status: 403 })
}
