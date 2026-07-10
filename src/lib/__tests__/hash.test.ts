import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertEntryHashSecret,
  generateEntryHash,
  verifyEntryHash,
  verifyEntryHashDetailed,
} from '../hash'

const VALID_SECRET = 'a'.repeat(64) // 64 chars hex — formato de `openssl rand -hex 32`

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generateEntryHash', () => {
  it('returns an hmac-v1 hash', async () => {
    const hash = await generateEntryHash({
      clockIn: '2026-02-22T09:00:00.000Z',
      clockOut: '2026-02-22T17:00:00.000Z',
      userId: 'user-123',
      entryDate: '2026-02-22',
    })
    expect(hash).toMatch(/^hmac-v1:[0-9a-f]{64}$/)
  })

  it('produces different hashes for different inputs', async () => {
    const base = {
      clockIn: '2026-02-22T09:00:00.000Z',
      clockOut: '2026-02-22T17:00:00.000Z',
      userId: 'user-123',
      entryDate: '2026-02-22',
    }
    const hash1 = await generateEntryHash(base)
    const hash2 = await generateEntryHash({ ...base, clockOut: '2026-02-22T18:00:00.000Z' })
    expect(hash1).not.toBe(hash2)
  })
})

describe('verifyEntryHash', () => {
  const entry = {
    clockIn: '2026-02-22T09:00:00.000Z',
    clockOut: '2026-02-22T17:00:00.000Z',
    userId: 'user-123',
    entryDate: '2026-02-22',
  }

  it('returns true for a hash that round-trips from generateEntryHash', async () => {
    const hash = await generateEntryHash(entry)
    await expect(verifyEntryHash(entry, hash)).resolves.toBe(true)
  })

  it('returns false when a field changed (clockOut +1min)', async () => {
    const hash = await generateEntryHash(entry)
    const tampered = { ...entry, clockOut: '2026-02-22T17:01:00.000Z' }
    await expect(verifyEntryHash(tampered, hash)).resolves.toBe(false)
  })

  it('returns false without throwing when the stored hash has a different length', async () => {
    await expect(verifyEntryHash(entry, 'hmac-v1:deadbeef')).resolves.toBe(false)
  })
})

describe('keyring de hashes de Sessão', () => {
  const entry = {
    clockIn: '2026-02-22T09:00:00.000Z',
    clockOut: '2026-02-22T17:00:00.000Z',
    userId: 'user-123',
    entryDate: '2026-02-22',
  }
  const legacySecret = 'a'.repeat(64)
  const activeSecret = 'b'.repeat(64)

  function configureKeyring(activeKeyId = 'k2026-10') {
    vi.stubEnv('ENTRY_HASH_KEY_IDS', 'k2026-07,k2026-10')
    vi.stubEnv('ENTRY_HASH_ACTIVE_KEY_ID', activeKeyId)
    vi.stubEnv('ENTRY_HASH_LEGACY_KEY_ID', 'k2026-07')
    vi.stubEnv('ENTRY_HASH_SECRET_K2026_07', legacySecret)
    vi.stubEnv('ENTRY_HASH_SECRET_K2026_10', activeSecret)
  }

  it('grava hashes novos com o keyId ativo', async () => {
    configureKeyring()

    await expect(generateEntryHash(entry)).resolves.toMatch(/^hmac-v1:k2026-10:[0-9a-f]{64}$/)
  })

  it('continua verificando hashes legados sem re-hash depois da migração para o keyring', async () => {
    vi.stubEnv('ENTRY_HASH_SECRET', legacySecret)
    const legacyHash = await generateEntryHash(entry)

    configureKeyring()
    const activeHash = await generateEntryHash(entry)

    await expect(verifyEntryHash(entry, legacyHash)).resolves.toBe(true)
    await expect(verifyEntryHash(entry, activeHash)).resolves.toBe(true)
  })

  it('continua verificando uma chave identificada anterior depois de trocar a chave ativa', async () => {
    configureKeyring('k2026-07')
    const historicalKeyedHash = await generateEntryHash(entry)

    configureKeyring('k2026-10')

    await expect(verifyEntryHash(entry, historicalKeyedHash)).resolves.toBe(true)
  })

  it('distingue um keyId indisponível de uma adulteração do hash', async () => {
    configureKeyring()

    await expect(
      verifyEntryHashDetailed(entry, `hmac-v1:k2027-01:${'0'.repeat(64)}`)
    ).resolves.toEqual({ status: 'unknown-key', keyId: 'k2027-01' })
  })

  it('distingue um hash malformado de uma adulteração criptográfica', async () => {
    configureKeyring()

    await expect(verifyEntryHashDetailed(entry, 'hmac-v1:k2026-10:incompleto')).resolves.toEqual({
      status: 'malformed',
    })
  })
})

describe('assertEntryHashSecret — validação do segredo', () => {
  const entry = {
    clockIn: '2026-02-22T09:00:00.000Z',
    clockOut: '2026-02-22T17:00:00.000Z',
    userId: 'user-123',
    entryDate: '2026-02-22',
  }

  it('passa com um segredo válido de 64 hex em produção', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENTRY_HASH_SECRET', VALID_SECRET)
    expect(() => assertEntryHashSecret()).not.toThrow()
  })

  it('lança em produção quando o segredo está ausente', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENTRY_HASH_SECRET', undefined)
    expect(() => assertEntryHashSecret()).toThrow(/ENTRY_HASH_SECRET/)
  })

  it.each([
    ['string vazia', ''],
    ['só espaços', '    '],
    ['curto', 'abc'],
    ['64 chars não-hex', 'g'.repeat(64)],
    ['hex mas comprimento errado', 'a'.repeat(32)],
  ])('lança quando o segredo é inválido: %s', (_label, value) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENTRY_HASH_SECRET', value)
    expect(() => assertEntryHashSecret()).toThrow(/ENTRY_HASH_SECRET/)
  })

  it('fora de produção, aceita a AUSÊNCIA (fallback dev) sem lançar', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ENTRY_HASH_SECRET', undefined)
    expect(() => assertEntryHashSecret()).not.toThrow()
    // e o hash ainda é gerável com o segredo de desenvolvimento
    await expect(generateEntryHash(entry)).resolves.toMatch(/^hmac-v1:[0-9a-f]{64}$/)
  })

  it('fora de produção, um segredo DEFINIDO porém inválido ainda lança (pega misconfig no dev)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ENTRY_HASH_SECRET', '')
    expect(() => assertEntryHashSecret()).toThrow(/ENTRY_HASH_SECRET/)
  })

  it('lança quando o keyring está configurado parcialmente', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENTRY_HASH_KEY_IDS', 'k2026-07')

    expect(() => assertEntryHashSecret()).toThrow(/ENTRY_HASH_ACTIVE_KEY_ID/)
  })
})
