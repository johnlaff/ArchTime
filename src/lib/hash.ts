import { createHmac, timingSafeEqual } from 'crypto'

const HASH_PREFIX = 'hmac-v1:'
const DEV_SECRET = 'dev-only-entry-hash-secret'
// 32 bytes em hex minúsculo — o formato de `openssl rand -hex 32`, o secret canônico
// de produção. Casar um formato explícito rejeita string vazia, espaços e valores fracos
// que passariam num teste `!secret` (`''` cai fora do `??`, e é exatamente esse buraco que
// derrubou o clock-out em produção).
const SECRET_PATTERN = /^[0-9a-f]{64}$/

/**
 * Resolve e valida o `ENTRY_HASH_SECRET`.
 *
 * Fora de produção aceita a ausência da var e usa um segredo de desenvolvimento fixo
 * (para `npm run dev`/testes rodarem sem configuração). Em produção — ou sempre que a var
 * esteja definida — exige o formato canônico e lança na hora. A validação acontece no boot
 * (via `src/instrumentation.ts`), então um segredo ausente/mal formatado falha o START do
 * container em vez de deixar o app subir e quebrar só no primeiro clock-out.
 */
function getEntryHashSecret(): string {
  const secret = process.env.ENTRY_HASH_SECRET
  if (secret === undefined && process.env.NODE_ENV !== 'production') {
    return DEV_SECRET
  }
  if (secret === undefined || !SECRET_PATTERN.test(secret)) {
    throw new Error(
      'ENTRY_HASH_SECRET inválido ou ausente: esperado 32 bytes em 64 caracteres hexadecimais (ex.: `openssl rand -hex 32`).'
    )
  }
  return secret
}

/** Valida a presença/formato do segredo. Chamado no boot para falhar cedo (fail-fast). */
export function assertEntryHashSecret(): void {
  getEntryHashSecret()
}

export async function generateEntryHash(entry: {
  clockIn: string
  clockOut: string
  userId: string
  entryDate: string
}): Promise<string> {
  const secret = getEntryHashSecret()

  const data = JSON.stringify({
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    userId: entry.userId,
    entryDate: entry.entryDate,
  })
  return `${HASH_PREFIX}${createHmac('sha256', secret).update(data).digest('hex')}`
}

/** Recomputa o HMAC e compara em tempo constante com o hash armazenado. */
export async function verifyEntryHash(
  entry: { clockIn: string; clockOut: string; userId: string; entryDate: string },
  storedHash: string
): Promise<boolean> {
  const expected = await generateEntryHash(entry)
  const a = Buffer.from(expected)
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}
