# Design: Fase 3-B — Performance + Harness Engineering

**Data:** 2026-05-22
**Status:** Aprovado
**Branch:** `feat/phase-2-sidebar`

---

## Problema

Após o deploy da Fase 2.1, ainda há delay perceptível ao navegar entre abas quando o cache expirou ou não existe. O critério de aceite é: **zero delay perceptível** (< 300ms em cold, < 100ms em warm).

**Causa raiz:** `sidebar-nav.tsx` não define `prefetch` no `<Link>`, então usa o padrão "auto" que para rotas dinâmicas (auth via cookies) só pré-busca até o `loading.js` mais próximo. `navbar.tsx` tem `prefetch={false}` explícito. O `router.prefetch()` manual só é chamado no hover/focus — se o usuário clicar sem pairar, faz round-trip completo ao servidor.

---

## Solução

### 1. `prefetch={true}` em todos os Links de navegação

`prefetch={true}` faz o `IntersectionObserver` pré-buscar o payload RSC completo assim que os links entram no viewport — i.e., no mount da página, antes de qualquer interação. Combinado com `staleTimes.dynamic: 30`, o payload fica em cache por 30s. Clicar dentro da janela = instantâneo.

**`src/components/sidebar-nav.tsx`:**
- Adicionar `prefetch={true}` ao `<Link>`
- Remover `onMouseEnter` e `onFocus` com `router.prefetch()` (redundante — o IntersectionObserver já cobre)
- Remover `useRouter` (não usado mais)
- Remover `import { useRouter }` do import

**`src/components/navbar.tsx`:**
- Mudar `prefetch={false}` → `prefetch={true}` nos Links de navegação
- Remover função `prefetchRoute` e chamadas `onMouseEnter`/`onFocus` (redundante)
- Remover `useRouter` se não usado por outra coisa (verificar — é usado em `handleLogout`)

### 2. `data-page-ready` no PageShell

Adicionar atributo ao wrapper de `src/components/page-shell.tsx`:

```tsx
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-page-ready="true"
      className="max-w-[920px] mx-auto w-full px-4 sm:px-6 py-6"
    >
      {children}
    </div>
  )
}
```

Esse atributo é o sinal de "rota renderizada e interativa" para o Playwright.

### 3. Hook de telemetria de performance (dev-only)

**Novo arquivo: `src/hooks/use-perf-monitor.ts`**

```ts
'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function usePerfMonitor() {
  const pathname = usePathname()
  // Armazena o timestamp no momento em que o pathname muda (início da transição)
  const prevPathnameRef = useRef<string>(pathname)
  const startRef = useRef<number>(performance.now())

  // Quando o pathname muda, o efeito anterior já rodou e o novo pathname chegou
  if (prevPathnameRef.current !== pathname) {
    prevPathnameRef.current = pathname
    // startRef já foi atualizado pelo efeito anterior — não resetar aqui
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('archtime-perf') !== '1') return

    const elapsed = Math.round(performance.now() - startRef.current)
    // Primeira renderização: elapsed será próximo de 0, ignorar
    if (elapsed > 10) {
      console.log(`[ArchTime Perf] ${pathname}: ${elapsed}ms`)
    }
    // Resetar para a próxima navegação
    startRef.current = performance.now()
  }, [pathname])
}
```

**Uso:** chamado dentro de `Providers` (já é Client Component em `src/components/providers.tsx`) como `usePerfMonitor()`. Ativado via `localStorage.setItem('archtime-perf', '1')` no DevTools.

### 4. Playwright performance harness

**Instalar:**
```bash
npm install -D @playwright/test
npx playwright install chromium --with-deps
```

**`playwright.config.ts`** (raiz do projeto):

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

**`e2e/helpers/auth.ts`:**

```ts
import { Page } from '@playwright/test'

export async function injectSupabaseSession(page: Page) {
  const session = process.env.SUPABASE_TEST_SESSION
  if (!session) throw new Error('SUPABASE_TEST_SESSION não definido em .env.local')
  await page.goto('/')
  await page.evaluate((s) => {
    const parsed = JSON.parse(s)
    // Supabase armazena sessão com chave dinâmica baseada no project ref
    const key = Object.keys(localStorage).find(k => k.endsWith('-auth-token'))
      ?? `sb-${parsed.project_ref}-auth-token`
    localStorage.setItem(key, s)
  }, session)
}
```

**`e2e/perf.spec.ts`:**

```ts
import { test, expect } from '@playwright/test'
import { injectSupabaseSession } from './helpers/auth'

const ROUTES = [
  { from: '/dashboard',     to: '/historico',     label: 'Ponto → Histórico' },
  { from: '/historico',     to: '/projetos',      label: 'Histórico → Projetos' },
  { from: '/projetos',      to: '/configuracoes', label: 'Projetos → Config' },
  { from: '/configuracoes', to: '/dashboard',     label: 'Config → Ponto' },
]

const THRESHOLD_MS = 300

test.beforeEach(async ({ page }) => {
  await injectSupabaseSession(page)
})

for (const { from, to, label } of ROUTES) {
  test(`Navegação ${label} < ${THRESHOLD_MS}ms`, async ({ page }) => {
    await page.goto(from)
    // Aguarda rota estar pronta antes de medir
    await page.waitForSelector('[data-page-ready]', { timeout: 5_000 })

    const start = await page.evaluate(() => performance.now())
    await page.click(`a[href="${to}"]`)
    await page.waitForSelector('[data-page-ready]', { timeout: 5_000 })
    const elapsed = await page.evaluate((s) => Math.round(performance.now() - s), start)

    console.log(`  ${label}: ${elapsed}ms`)
    expect(elapsed, `${label} excedeu ${THRESHOLD_MS}ms (foi ${elapsed}ms)`).toBeLessThan(THRESHOLD_MS)
  })
}
```

**`package.json` — adicionar script:**
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**`.env.local.example` — adicionar:**
```
# Playwright: exportar de localStorage após login manual (chave sb-*-auth-token)
SUPABASE_TEST_SESSION=
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

---

## Arquivos Criados/Modificados

| Arquivo | Mudança |
|---|---|
| `src/components/sidebar-nav.tsx` | `prefetch={true}`, remove `useRouter` + handlers manuais |
| `src/components/navbar.tsx` | `prefetch={true}`, remove `prefetchRoute` + handlers |
| `src/components/page-shell.tsx` | Adiciona `data-page-ready="true"` |
| `src/hooks/use-perf-monitor.ts` | Novo — telemetria dev-only |
| `src/components/providers.tsx` | Chama `usePerfMonitor()` |
| `playwright.config.ts` | Novo |
| `e2e/perf.spec.ts` | Novo |
| `e2e/helpers/auth.ts` | Novo |
| `package.json` | Scripts `test:e2e`, `test:e2e:ui` |
| `.env.local.example` | Variáveis de Playwright |

---

## Critérios de Aceite

- [ ] Navegação entre qualquer par de abas < 300ms (cold) após prefetch no viewport
- [ ] Retornar a aba visitada < 30s = instantâneo (< 50ms)
- [ ] `npm run test:e2e` executa e reporta timings
- [ ] `localStorage.setItem('archtime-perf', '1')` + navegar imprime timings no console
- [ ] Build sem erros TypeScript
- [ ] 61 testes Vitest passando
