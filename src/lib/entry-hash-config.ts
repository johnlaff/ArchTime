import { ENTRY_HASH_KEY_ID_PATTERN } from '@/lib/entry-hash-format'

const DEV_SECRET = 'dev-only-entry-hash-secret'
const SECRET_PATTERN = /^[0-9a-f]{64}$/
const KEYRING_VARIABLES = [
  'ENTRY_HASH_KEY_IDS',
  'ENTRY_HASH_ACTIVE_KEY_ID',
  'ENTRY_HASH_LEGACY_KEY_ID',
]

export interface EntryHashConfiguration {
  keyed: boolean
  active: { keyId: string | null; secret: string }
  legacy: { keyId: string | null; secret: string }
  keys: ReadonlyMap<string, string>
}

function invalidSecret(name: string): Error {
  return new Error(
    `${name} inválido ou ausente: esperado 32 bytes em 64 caracteres hexadecimais (ex.: \`openssl rand -hex 32\`).`
  )
}

function requireSecret(name: string): string {
  const secret = process.env[name]
  if (!secret || !SECRET_PATTERN.test(secret)) throw invalidSecret(name)
  return secret
}

function readLegacySecret(): string {
  const secret = process.env.ENTRY_HASH_SECRET
  if (secret === undefined && process.env.NODE_ENV !== 'production') {
    return DEV_SECRET
  }
  if (secret === undefined || !SECRET_PATTERN.test(secret)) {
    throw invalidSecret('ENTRY_HASH_SECRET')
  }
  return secret
}

function environmentVariableForKey(keyId: string): string {
  return `ENTRY_HASH_SECRET_${keyId.toUpperCase().replaceAll('-', '_')}`
}

function hasPartialKeyringConfiguration(): boolean {
  return KEYRING_VARIABLES.some((name) => process.env[name] !== undefined) ||
    Object.keys(process.env).some((name) => name.startsWith('ENTRY_HASH_SECRET_'))
}

function parseKeyIds(): string[] | null {
  const raw = process.env.ENTRY_HASH_KEY_IDS
  if (raw === undefined) {
    if (hasPartialKeyringConfiguration()) {
      throw new Error('ENTRY_HASH_KEY_IDS é obrigatório quando um keyring de hashes está configurado.')
    }
    return null
  }

  const keyIds = raw.split(',').map((keyId) => keyId.trim())
  if (keyIds.length === 0 || keyIds.some((keyId) => !ENTRY_HASH_KEY_ID_PATTERN.test(keyId))) {
    throw new Error('ENTRY_HASH_KEY_IDS deve conter keyIds únicos em minúsculas, separados por vírgula.')
  }
  if (new Set(keyIds).size !== keyIds.length) {
    throw new Error('ENTRY_HASH_KEY_IDS não pode repetir um keyId.')
  }
  return keyIds
}

function configuredKeyId(name: string, keyIds: string[]): string {
  const keyId = process.env[name]
  if (!keyId || !ENTRY_HASH_KEY_ID_PATTERN.test(keyId) || !keyIds.includes(keyId)) {
    throw new Error(`${name} deve apontar para um keyId presente em ENTRY_HASH_KEY_IDS.`)
  }
  return keyId
}

/**
 * Resolve a configuração de HMAC. Sem keyring, preserva o formato legado durante
 * a implantação gradual; com keyring, a chave ativa assina e a chave legada valida
 * hashes sem keyId que já existem no histórico.
 */
export function getEntryHashConfiguration(): EntryHashConfiguration {
  const keyIds = parseKeyIds()
  if (!keyIds) {
    const secret = readLegacySecret()
    return {
      keyed: false,
      active: { keyId: null, secret },
      legacy: { keyId: null, secret },
      keys: new Map(),
    }
  }

  const activeKeyId = configuredKeyId('ENTRY_HASH_ACTIVE_KEY_ID', keyIds)
  const legacyKeyId = configuredKeyId('ENTRY_HASH_LEGACY_KEY_ID', keyIds)
  const keys = new Map(keyIds.map((keyId) => [keyId, requireSecret(environmentVariableForKey(keyId))]))

  return {
    keyed: true,
    active: { keyId: activeKeyId, secret: keys.get(activeKeyId)! },
    legacy: { keyId: legacyKeyId, secret: keys.get(legacyKeyId)! },
    keys,
  }
}

/** Valida toda a configuração no boot do servidor para falhar cedo. */
export function assertEntryHashConfiguration(): void {
  getEntryHashConfiguration()
}

/** Alias de compatibilidade para os call sites e testes existentes. */
export const assertEntryHashSecret = assertEntryHashConfiguration
