/**
 * Resolve o origin público canônico da aplicação para montar redirects server-side.
 *
 * Atrás de um proxy (ex.: Azure App Service → container standalone), `request.url`
 * resolve para o binding interno do container (`http://0.0.0.0:8080`), o que geraria
 * redirects quebrados no navegador. `NEXT_PUBLIC_APP_URL` é a URL pública canônica em
 * todos os ambientes (dev = `http://localhost:3000`, prod = `https://archtime.app`),
 * então a usamos como fonte da verdade — caindo no origin da request apenas quando a
 * env não está definida (fallback defensivo).
 */
export function resolveAppOrigin(requestOrigin?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin ?? ''
  return base.replace(/\/+$/, '')
}
