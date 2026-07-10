/**
 * Next.js instrumentation — `register()` roda uma vez por instância do servidor, antes de
 * atender qualquer requisição. Faz duas coisas no boot:
 *
 * 1. Inicializa o Sentry no runtime apropriado (server/edge).
 * 2. Valida config obrigatória: se o keyring de HMAC estiver ausente/mal formatado, o
 *    processo falha o start e o App Service reprova o deploy — em vez de subir "saudável"
 *    e quebrar só no primeiro clock-out (o bug que originou esta validação). Ver
 *    `src/lib/entry-hash-config.ts`.
 */
export async function register() {
  // Sentry primeiro, para instrumentar já o restante do boot.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }

  // Validação do keyring: só no runtime Node de servidor. Pula o edge e a fase de build
  // (`next build`), onde o segredo é deliberadamente ausente (runtime-only no Dockerfile).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { assertEntryHashConfiguration } = await import('./lib/entry-hash-config')
  assertEntryHashConfiguration()
}

// Captura erros server-side (route handlers, server actions, RSC) — inclui o 500 de
// clock-out que motivou a observabilidade. Ver `src/app/api/clock/[id]/route.ts`.
export { captureRequestError as onRequestError } from '@sentry/nextjs'
