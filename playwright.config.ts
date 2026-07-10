import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Load .env.local into process.env (inherited by workers + the webServer). Avoids
// depending on a --env-file CLI flag that this Playwright version doesn't accept.
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const key = match[1]
    if (process.env[key]) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
} catch {
  // .env.local optional (e.g. CI provides env directly)
}

// Os E2E locais compartilham o banco de produção. Quando o clone ainda só tem
// ENTRY_HASH_SECRET, espelhe o keyring de bootstrap da ADR 0005 para conseguir
// verificar os hashes históricos já identificados. Um keyring explícito (inclusive
// parcial) sempre prevalece, para que a validação de boot continue encontrando erro.
const hasExplicitHashKeyring = [
  'ENTRY_HASH_KEY_IDS',
  'ENTRY_HASH_ACTIVE_KEY_ID',
  'ENTRY_HASH_LEGACY_KEY_ID',
].some((name) => process.env[name] !== undefined) ||
  Object.keys(process.env).some((name) => name.startsWith('ENTRY_HASH_SECRET_'))

if (!hasExplicitHashKeyring && process.env.ENTRY_HASH_SECRET) {
  const bootstrapKeyId = 'k2026-07'
  process.env.ENTRY_HASH_KEY_IDS = bootstrapKeyId
  process.env.ENTRY_HASH_ACTIVE_KEY_ID = bootstrapKeyId
  process.env.ENTRY_HASH_LEGACY_KEY_ID = bootstrapKeyId
  process.env.ENTRY_HASH_SECRET_K2026_07 = process.env.ENTRY_HASH_SECRET
}

/** True when no base URL is set or it points at a loopback host (so we auto-start dev). */
function isLocalBaseURL(baseURL: string | undefined): boolean {
  if (!baseURL) return true
  try {
    const host = new URL(baseURL).hostname.replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
  } catch {
    return true
  }
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // Serial: a suíte compartilha um dev server e UMA conta; o fluxo de ponto é
  // mutante. Rodar em paralelo causa interferência e timeouts no dev frio.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // Auto-start the dev server for local runs; reuse one if already running. When
  // PLAYWRIGHT_BASE_URL targets a remote host (preview/prod), don't start a server.
  // "Local" = unset, or a loopback host (localhost / 127.0.0.1 / ::1 / 0.0.0.0).
  webServer: isLocalBaseURL(process.env.PLAYWRIGHT_BASE_URL)
    ? {
        command: 'npm run dev',
        // `/` redireciona para `/login` quando não há sessão, e o Playwright não
        // considera esse 307 como servidor reutilizável. A rota pública responde 200.
        url: 'http://localhost:3000/login',
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
  projects: [
    // Mints a real session via the service-role key and saves storageState.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // All other specs reuse that authenticated state (cookie-based SSR auth).
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
})
