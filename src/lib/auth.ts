/**
 * Verifica se o email pertence à lista de emails permitidos.
 * Lê ALLOWED_EMAILS (vírgula-separado) do ambiente.
 */
export function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .flatMap((e) => { const t = e.trim(); return t ? [t] : [] })
  return allowed.includes(email)
}
