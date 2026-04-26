export function getOAuthRedirectTo(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/auth/callback`
}
