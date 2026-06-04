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
  webServer:
    process.env.PLAYWRIGHT_BASE_URL && !process.env.PLAYWRIGHT_BASE_URL.includes('localhost')
      ? undefined
      : {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 180_000,
        },
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
