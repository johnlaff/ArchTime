import { connection, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Health check para o probe do Azure App Service e o uptime monitor do Sentry.
 * Público (sem auth — ver a allowlist do matcher em `src/proxy.ts`) e não vaza detalhe.
 *
 * `await connection()` opta a rota para execução em request time: com `cacheComponents`
 * ligado, sem isso o Next tentaria prerenderizar o GET no build e rodar o `SELECT 1`
 * sem `DATABASE_URL` (segredo runtime-only), quebrando o build.
 */
export async function GET() {
  await connection()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(
      { status: 'degraded' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
