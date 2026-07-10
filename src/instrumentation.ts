/**
 * Next.js instrumentation — `register()` roda uma vez por instância do servidor, antes de
 * atender qualquer requisição. Usamos isso para validar config obrigatória no BOOT: se o
 * `ENTRY_HASH_SECRET` estiver ausente/mal formatado, o processo falha o start e o App Service
 * reprova o deploy — em vez de subir "saudável" e quebrar só no primeiro clock-out (o bug que
 * originou esta mudança). Ver `src/lib/entry-hash-config.ts`.
 */
export async function register() {
  // Só no runtime Node de servidor. Pula o edge runtime e a fase de build (`next build`),
  // onde o segredo é deliberadamente ausente (runtime-only no Dockerfile).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { assertEntryHashConfiguration } = await import('./lib/entry-hash-config')
  assertEntryHashConfiguration()
}
