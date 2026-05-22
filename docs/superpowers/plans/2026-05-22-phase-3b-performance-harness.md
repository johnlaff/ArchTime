# Fase 3-B — Performance + Harness Engineering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar delay perceptível na navegação entre abas via `prefetch={true}` nos Links de sidebar/navbar, e instalar harness Playwright que valida automaticamente que a navegação fica abaixo de 300ms.

**Architecture:** `prefetch={true}` faz o `IntersectionObserver` do Next.js pré-buscar payloads RSC assim que os Links entram no viewport (no mount), não só no hover. Combinado com `staleTimes.dynamic: 30` já configurado, o cache de 30s torna re-navegações instantâneas. O harness usa `data-page-ready` no `PageShell` como sinal de "rota interativa" para o Playwright medir com `performance.now()`.

**Tech Stack:** Next.js 16.2, React 19, `@playwright/test`, Vitest 4 (existente).

---

## Mapa de Arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/components/sidebar-nav.tsx` | Modificar | `prefetch={true}`, remove `useRouter` + handlers hover |
| `src/components/navbar.tsx` | Modificar | `prefetch={true}`, remove `prefetchRoute` + handlers hover |
| `src/components/page-shell.tsx` | Modificar | Adiciona `data-page-ready="true"` |
| `src/hooks/use-perf-monitor.ts` | Criar | Hook dev-only que loga timings no console |
| `src/components/providers.tsx` | Modificar | Chama `usePerfMonitor()` |
| `playwright.config.ts` | Criar | Config do Playwright |
| `e2e/helpers/auth.ts` | Criar | Injeta sessão Supabase via localStorage |
| `e2e/perf.spec.ts` | Criar | Testes de timing de navegação |
| `package.json` | Modificar | Scripts `test:e2e` e `test:e2e:ui` |
| `.env.local.example` | Modificar | Variáveis `SUPABASE_TEST_SESSION` e `PLAYWRIGHT_BASE_URL` |

---

## Task 1: prefetch={true} na SidebarNav e Navbar

**Files:**
- Modify: `src/components/sidebar-nav.tsx`
- Modify: `src/components/navbar.tsx`

- [ ] **Step 1.1: Reescrever sidebar-nav.tsx com prefetch={true}**

Substituir o conteúdo completo de `src/components/sidebar-nav.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { Clock, History, FolderOpen, Settings, BarChart2, CreditCard } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  kbd: string
  disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Ponto',         icon: Clock,       kbd: 'P' },
  { href: '/historico',     label: 'Histórico',     icon: History,     kbd: 'H' },
  { href: '/projetos',      label: 'Projetos',      icon: FolderOpen,  kbd: 'J' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings,    kbd: 'S' },
  { href: '/relatorios',    label: 'Relatórios',    icon: BarChart2,   kbd: 'R', disabled: true },
  { href: '/faturamento',   label: 'Faturamento',   icon: CreditCard,  kbd: 'F', disabled: true },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, kbd, disabled }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={disabled ? '#' : href}
            prefetch={disabled ? false : true}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onClick={(e) => { if (disabled) e.preventDefault() }}
            className={[
              'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors select-none',
              disabled
                ? 'pointer-events-none opacity-40 text-muted-foreground cursor-not-allowed'
                : isActive
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            ].join(' ')}
          >
            {isActive && !disabled && (
              <motion.span
                layoutId="nav-indicator"
                className="absolute inset-0 rounded-lg bg-accent pointer-events-none"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <Icon className="relative h-4 w-4 flex-shrink-0" />
            <span className="relative flex-1">{label}</span>
            <kbd className="relative font-mono text-[10px] text-muted-foreground/50 border border-border/50 rounded px-1 py-px">
              {kbd}
            </kbd>
          </Link>
        )
      })}
    </nav>
  )
}
```

Mudanças: removido `useRouter`, `onMouseEnter`, `onFocus`, adicionado `prefetch={disabled ? false : true}`.

- [ ] **Step 1.2: Atualizar navbar.tsx — prefetch={true}, remover prefetchRoute**

Em `src/components/navbar.tsx`:

**a)** Remover a função `prefetchRoute` (linhas 62–64 aprox):
```tsx
// REMOVER estas linhas:
function prefetchRoute(href: string) {
  router.prefetch(href)
}
```

**b)** Nos Links de navegação (`navItems.map`), substituir:
```tsx
// Antes:
<Link
  key={href}
  href={href}
  prefetch={false}
  onMouseEnter={() => prefetchRoute(href)}
  onFocus={() => prefetchRoute(href)}
>

// Depois:
<Link
  key={href}
  href={href}
  prefetch={true}
>
```

**c)** Verificar se `useRouter` ainda é usado (sim — em `handleLogout`). Manter o import `useRouter`.

- [ ] **Step 1.3: Build**

```bash
cd C:\Users\John\Documents\ArchTime\pontoarq\.worktrees\feat-phase-2-sidebar
npm run build
```

Esperado: compilação limpa, sem erros TypeScript.

- [ ] **Step 1.4: Testes**

```bash
npm test
```

Esperado: 61 testes passando.

- [ ] **Step 1.5: Commit**

```bash
git add src/components/sidebar-nav.tsx src/components/navbar.tsx

git commit -m "$(cat <<'EOF'
perf: prefetch={true} em Links de navegação — elimina delay por hover

IntersectionObserver pré-busca payloads RSC de todas as abas assim que a
sidebar entra no viewport. Remove router.prefetch() manual redundante.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: PageShell data-page-ready + Hook usePerfMonitor

**Files:**
- Modify: `src/components/page-shell.tsx`
- Create: `src/hooks/use-perf-monitor.ts`
- Modify: `src/components/providers.tsx`

- [ ] **Step 2.1: Adicionar data-page-ready ao PageShell**

Substituir `src/components/page-shell.tsx` completo:

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

- [ ] **Step 2.2: Criar src/hooks/use-perf-monitor.ts**

```ts
'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function usePerfMonitor() {
  const pathname = usePathname()
  const prevRef = useRef(pathname)
  const startRef = useRef(
    typeof performance !== 'undefined' ? performance.now() : 0
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('archtime-perf') !== '1') return

    if (prevRef.current !== pathname) {
      const elapsed = Math.round(performance.now() - startRef.current)
      console.log(
        `%c[ArchTime Perf]%c ${prevRef.current} → ${pathname}: %c${elapsed}ms`,
        'color:#6366f1;font-weight:bold',
        'color:inherit',
        elapsed < 150 ? 'color:#10b981;font-weight:bold' : elapsed < 300 ? 'color:#f59e0b;font-weight:bold' : 'color:#ef4444;font-weight:bold'
      )
      prevRef.current = pathname
    }
    startRef.current = performance.now()
  }, [pathname])
}
```

Para ativar: `localStorage.setItem('archtime-perf', '1')` no DevTools.
Verdes < 150ms, amarelos < 300ms, vermelhos ≥ 300ms.

- [ ] **Step 2.3: Chamar usePerfMonitor em providers.tsx**

Em `src/components/providers.tsx`, adicionar import e chamada dentro de `PreferencesHydrator` (já é Client Component, já usa hooks):

```tsx
// Adicionar no topo:
import { usePerfMonitor } from '@/hooks/use-perf-monitor'

// Dentro de PreferencesHydrator(), adicionar como primeira linha:
usePerfMonitor()
```

Resultado de `PreferencesHydrator`:
```tsx
function PreferencesHydrator() {
  const { setTheme } = useTheme()
  const { setAccent } = useAccentColor()
  usePerfMonitor()

  useEffect(() => {
    // ... resto do código existente sem alteração
  }, [setAccent, setTheme])

  return null
}
```

- [ ] **Step 2.4: Build**

```bash
npm run build
```

Esperado: compilação limpa.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/page-shell.tsx src/hooks/use-perf-monitor.ts src/components/providers.tsx

git commit -m "$(cat <<'EOF'
feat: harness de performance dev-only + data-page-ready no PageShell

- data-page-ready="true" no PageShell — selector estável para Playwright
- usePerfMonitor: ativar via localStorage archtime-perf=1, loga timings
  coloridos no console (verde <150ms, amarelo <300ms, vermelho ≥300ms)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Playwright — Instalação, Config e Testes de Performance

**Files:**
- `playwright.config.ts` (criar na raiz)
- `e2e/helpers/auth.ts` (criar)
- `e2e/perf.spec.ts` (criar)
- `package.json` (scripts)
- `.env.local.example` (variáveis)

- [ ] **Step 3.1: Instalar Playwright**

```bash
cd C:\Users\John\Documents\ArchTime\pontoarq\.worktrees\feat-phase-2-sidebar
npm install -D @playwright/test
npx playwright install chromium --with-deps
```

Esperado: `@playwright/test` aparece em `devDependencies` no `package.json`.

- [ ] **Step 3.2: Criar playwright.config.ts na raiz**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

- [ ] **Step 3.3: Criar e2e/helpers/auth.ts**

```ts
import type { Page } from '@playwright/test'

export async function injectSupabaseSession(page: Page): Promise<void> {
  const session = process.env.SUPABASE_TEST_SESSION
  if (!session) {
    throw new Error(
      'SUPABASE_TEST_SESSION não definido em .env.local.\n' +
      'Faça login no app, abra DevTools → Application → Local Storage,\n' +
      'copie o valor da chave que começa com "sb-" e termine em "-auth-token",\n' +
      'e cole em .env.local como SUPABASE_TEST_SESSION=<valor>'
    )
  }
  await page.goto('/')
  await page.evaluate((s) => {
    // Encontra a chave Supabase dinamicamente (ex: sb-xyz-auth-token)
    const existingKey = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    )
    if (existingKey) {
      localStorage.setItem(existingKey, s)
    } else {
      // Fallback: tenta parsear o projeto do próprio token
      try {
        const parsed = JSON.parse(s)
        const ref = parsed?.user?.aud ?? 'authenticated'
        localStorage.setItem(`sb-${ref}-auth-token`, s)
      } catch {
        throw new Error('Não foi possível determinar a chave do Supabase. Verifique SUPABASE_TEST_SESSION.')
      }
    }
  }, session)
}
```

- [ ] **Step 3.4: Criar e2e/perf.spec.ts**

```ts
import { test, expect } from '@playwright/test'
import { injectSupabaseSession } from './helpers/auth'

const ROUTES = [
  { from: '/dashboard',     to: '/historico',     label: 'Ponto → Histórico' },
  { from: '/historico',     to: '/projetos',      label: 'Histórico → Projetos' },
  { from: '/projetos',      to: '/configuracoes', label: 'Projetos → Config' },
  { from: '/configuracoes', to: '/dashboard',     label: 'Config → Ponto' },
] as const

const THRESHOLD_MS = 300

test.describe('Navegação entre abas', () => {
  test.beforeEach(async ({ page }) => {
    await injectSupabaseSession(page)
    // Recarregar para que a sessão seja lida pelo Supabase SSR
    await page.reload()
  })

  for (const { from, to, label } of ROUTES) {
    test(`${label} < ${THRESHOLD_MS}ms`, async ({ page }) => {
      await page.goto(from)
      await page.waitForSelector('[data-page-ready]', { timeout: 10_000 })

      // Captura timestamp antes do clique
      const start = await page.evaluate(() => performance.now())

      // Clica no link da sidebar (ou navbar no mobile)
      await page.click(`a[href="${to}"]:not([aria-disabled="true"])`)

      // Aguarda o novo conteúdo estar pronto
      await page.waitForSelector('[data-page-ready]', { timeout: 10_000 })

      const elapsed = await page.evaluate(
        (s) => Math.round(performance.now() - s),
        start
      )

      console.log(`  ✓ ${label}: ${elapsed}ms`)
      expect(
        elapsed,
        `${label} levou ${elapsed}ms — acima do limite de ${THRESHOLD_MS}ms`
      ).toBeLessThan(THRESHOLD_MS)
    })
  }
})
```

- [ ] **Step 3.5: Adicionar scripts ao package.json**

Em `package.json`, na seção `"scripts"`, adicionar após os scripts existentes:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:report": "playwright show-report"
```

- [ ] **Step 3.6: Adicionar variáveis ao .env.local.example**

Adicionar ao final de `.env.local.example`:

```
# ── Playwright performance tests ──────────────────────────────────────────
# URL base onde o app está rodando durante os testes
PLAYWRIGHT_BASE_URL=http://localhost:3000

# Sessão Supabase para injeção nos testes (sem login Google no CI)
# Como obter: faça login no app → DevTools → Application → Local Storage →
# copie o VALOR (não a chave) da entrada "sb-*-auth-token"
SUPABASE_TEST_SESSION=
```

- [ ] **Step 3.7: Build final e testes Vitest**

```bash
npm run build && npm test
```

Esperado: build limpo, 61 testes Vitest passando.

- [ ] **Step 3.8: Commit**

```bash
git add playwright.config.ts e2e/ package.json .env.local.example

git commit -m "$(cat <<'EOF'
feat: harness Playwright para validação de performance de navegação

- playwright.config.ts com projeto Chromium
- e2e/perf.spec.ts: 4 rotas, threshold 300ms, usa data-page-ready
- e2e/helpers/auth.ts: injeta sessão Supabase via localStorage
- Scripts test:e2e e test:e2e:ui no package.json

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Push

- [ ] **Step 4.1: Verificar estado git**

```bash
git log --oneline -5
git status
```

Esperado: working tree limpo, 3 commits novos da Fase 3-B.

- [ ] **Step 4.2: Push**

```bash
git push
```

Netlify inicia deploy de preview automaticamente.

---

## Checklist de Aceite

- [ ] Sidebar Links têm `prefetch={true}` (verificar DevTools → Network na primeira carga — requests RSC de `/historico`, `/projetos`, etc. aparecem sem hover)
- [ ] `npm run build` limpo
- [ ] `npm test` — 61 testes passando
- [ ] `localStorage.setItem('archtime-perf', '1')` e navegar imprime timings coloridos no console
- [ ] `[data-page-ready]` presente no DOM em todas as páginas com `PageShell`
- [ ] `npm run test:e2e` executa sem erro de configuração (pode falhar por falta de `SUPABASE_TEST_SESSION` — isso é esperado em CI sem sessão)
