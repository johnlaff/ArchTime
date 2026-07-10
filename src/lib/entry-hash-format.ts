/** Formato persistido de HMAC de Sessão, compartilhado pela configuração e verificação. */
export const ENTRY_HASH_PREFIX = 'hmac-v1'
export const ENTRY_HASH_DIGEST_PATTERN = /^[0-9a-f]{64}$/
export const ENTRY_HASH_KEY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
