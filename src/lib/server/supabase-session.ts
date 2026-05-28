interface NamedCookie {
  name: string
}

const SUPABASE_AUTH_COOKIE_RE =
  /^sb-[a-z0-9]+-auth-token(?:-(?:code-verifier|user))?(?:\.\d+)?$/i

function getStringProperty(value: unknown, property: string): string | undefined {
  if (!value || typeof value !== 'object' || !(property in value)) return undefined
  const propertyValue = (value as Record<string, unknown>)[property]
  return typeof propertyValue === 'string' ? propertyValue : undefined
}

export function isStaleRefreshTokenError(error: unknown): boolean {
  const code = getStringProperty(error, 'code') ?? getStringProperty(error, 'error_code')
  if (code === 'refresh_token_not_found') return true

  const message = error instanceof Error
    ? error.message
    : getStringProperty(error, 'message') ?? getStringProperty(error, 'error')

  return message?.includes('Invalid Refresh Token') === true ||
    message?.includes('Refresh Token Not Found') === true
}

export function isSupabaseAuthCookieName(name: string): boolean {
  return SUPABASE_AUTH_COOKIE_RE.test(name)
}

export function getSupabaseAuthCookieNames(cookies: NamedCookie[]): string[] {
  return cookies
    .map((cookie) => cookie.name)
    .filter(isSupabaseAuthCookieName)
}
