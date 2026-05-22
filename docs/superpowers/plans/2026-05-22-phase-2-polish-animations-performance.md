# Fase 2.1 — Polimento: Performance, Animações e Fluidez — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar 5 grupos de melhorias ao branch `feat/phase-2-sidebar` sem redesign visual: 3 correções imediatas, cache de navegação, transição de tema suave via View Transitions API, e micro-interações com Motion.

**Architecture:** Todas as mudanças estão confinadas ao branch existente. Motion (ex-Framer Motion v11) é adicionado apenas em Client Components. View Transitions API (já habilitada via `experimental.viewTransition: true`) é usada para transições de rota e de tema. `staleTimes` resolve o re-fetch desnecessário ao retornar a rotas visitadas recentemente.

**Tech Stack:** Next.js 16 App Router, React 19, Motion v11 (`motion` package), Tailwind CSS 4, Vitest 4.

---

## Mapa de Arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `next.config.ts` | Modificar | Adiciona `staleTimes` |
| `src/app/globals.css` | Modificar | CSS View Transitions para `main-content` |
| `src/components/navbar.tsx` | Modificar | Label "Configurações" + `startViewTransition` no toggle de tema |
| `src/components/sidebar-footer-controls.tsx` | Modificar | `startViewTransition` no toggle de tema |
| `src/components/current-session.tsx` | Modificar | Remove `font-mono` |
| `src/components/col-right.tsx` | Modificar | Remove Widget "Próximo Faturamento" |
| `src/components/sidebar-nav.tsx` | Modificar | `motion.span` com `layoutId="nav-indicator"` |
| `src/components/clock-button.tsx` | Modificar | `motion(Button)` com `whileTap` + `AnimatePresence` |
| `src/app/dashboard/dashboard-client.tsx` | Modificar | `AnimatePresence` envolvendo `<CurrentSession>` |
| `src/components/daily-summary.tsx` | Modificar | Adiciona `'use client'` + stagger com `motion.div` |

Nenhum arquivo novo criado.

---

## Task 1: Correções Imediatas + Performance

**Files:**
- Modify: `src/components/navbar.tsx:29`
- Modify: `src/components/current-session.tsx:38`
- Modify: `src/components/col-right.tsx:112-145`
- Modify: `next.config.ts`

- [ ] **Step 1.1: Renomear "Config" para "Configurações" no navbar**

Em `src/components/navbar.tsx`, linha 29:

```tsx
// Antes:
{ href: '/configuracoes', label: 'Config', icon: Settings },

// Depois:
{ href: '/configuracoes', label: 'Configurações', icon: Settings },
```

- [ ] **Step 1.2: Remover `font-mono` do timer em andamento**

Em `src/components/current-session.tsx`, linha 38:

```tsx
// Antes:
<span className="font-mono text-2xl font-bold tabular-nums tracking-tight">

// Depois:
<span className="text-2xl font-bold tabular-nums tracking-tight">
```

- [ ] **Step 1.3: Remover o Widget "Próximo Faturamento" de col-right.tsx**

Em `src/components/col-right.tsx`, remover as 5 linhas do widget de faturamento:

```tsx
// REMOVER completamente este bloco:
<Widget title="Próximo Faturamento">
  <p className="text-xs text-muted-foreground/60">
    Disponível após configurar valor/hora nos projetos (Fase 8).
  </p>
</Widget>
```

O arquivo deve terminar com o Widget de Atalhos de Teclado e fechar os dois `</div>` e `</aside>`.

- [ ] **Step 1.4: Adicionar staleTimes ao next.config.ts**

Substituir o bloco `experimental` em `next.config.ts`:

```ts
import withSerwist from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    viewTransition: true,
    staleTimes: { dynamic: 30, static: 180 },
  },
}

export default withSerwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
})(nextConfig)
```

- [ ] **Step 1.5: Verificar build**

```bash
cd pontoarq/.worktrees/feat-phase-2-sidebar
npm run build
```

Esperado: build sem erros TypeScript. Se houver erro, corrigir antes de continuar.

- [ ] **Step 1.6: Rodar testes existentes**

```bash
npm test
```

Esperado: todos os testes passando (61 testes).

- [ ] **Step 1.7: Commit**

```bash
git add next.config.ts \
        src/components/navbar.tsx \
        src/components/current-session.tsx \
        src/components/col-right.tsx

git commit -m "$(cat <<'EOF'
fix: correções imediatas e performance de navegação

- Renomeia label "Config" → "Configurações" no navbar mobile
- Remove font-mono do timer (consistência com cards de stats)
- Remove widget "Próximo Faturamento" da coluna direita
- Adiciona staleTimes { dynamic: 30, static: 180 } ao next.config.ts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Instalar Motion + CSS View Transitions

**Files:**
- `package.json` (via npm install)
- Modify: `src/app/globals.css`

- [ ] **Step 2.1: Instalar o pacote motion**

```bash
npm install motion
```

Verificar que `"motion"` apareceu em `package.json` dependencies.

- [ ] **Step 2.2: Adicionar CSS de View Transitions para rotas**

No final de `src/app/globals.css` (após todos os blocos existentes), adicionar:

```css
/* ── View Transitions — transição de rota apenas no <main> ── */
main {
  view-transition-name: main-content;
}

@keyframes vt-slide-out {
  to { opacity: 0; transform: translateX(-8px); }
}

@keyframes vt-slide-in {
  from { opacity: 0; transform: translateX(8px); }
}

::view-transition-old(main-content) {
  animation: 180ms var(--ease-out-expo) vt-slide-out;
}

::view-transition-new(main-content) {
  animation: 220ms var(--ease-out-expo) vt-slide-in;
}
```

O token `--ease-out-expo` já está definido em `:root` como `cubic-bezier(0.16, 1, 0.3, 1)`.

- [ ] **Step 2.3: Verificar build**

```bash
npm run build
```

Esperado: build limpo, sem erros.

- [ ] **Step 2.4: Commit**

```bash
git add package.json package-lock.json src/app/globals.css

git commit -m "$(cat <<'EOF'
feat: instala motion e adiciona CSS de view transitions para rotas

- npm install motion (ex-Framer Motion v11)
- View Transitions CSS: slide lateral suave apenas no <main> ao navegar

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Transição de Tema Suave (startViewTransition)

**Files:**
- Modify: `src/components/navbar.tsx`
- Modify: `src/components/sidebar-footer-controls.tsx`

- [ ] **Step 3.1: Atualizar handleThemeToggle no navbar.tsx**

Em `src/components/navbar.tsx`, substituir a função `handleThemeToggle` (atualmente por volta da linha 55):

```tsx
function handleThemeToggle() {
  const nextTheme = getNextThemeMode(resolvedTheme)
  markLocalPreferenceChange()
  const apply = () => {
    setTheme(nextTheme)
    persistAppearance({ themeMode: nextTheme })
  }
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    document.startViewTransition(apply)
  } else {
    apply()
  }
}
```

- [ ] **Step 3.2: Atualizar handleThemeToggle no sidebar-footer-controls.tsx**

Em `src/components/sidebar-footer-controls.tsx`, substituir a função `handleThemeToggle` (atualmente por volta da linha 44):

```tsx
function handleThemeToggle() {
  const next = getNextThemeMode(resolvedTheme)
  markLocalPreferenceChange()
  const apply = () => {
    setTheme(next)
    persistAppearance({ themeMode: next })
  }
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    document.startViewTransition(apply)
  } else {
    apply()
  }
}
```

- [ ] **Step 3.3: Verificar tipos TypeScript**

O TypeScript pode não reconhecer `startViewTransition` em `Document`. Se aparecer erro de tipo, adicionar a declaração de tipo inline:

```tsx
if (typeof document !== 'undefined' && 'startViewTransition' in document) {
  (document as Document & { startViewTransition: (cb: () => void) => void })
    .startViewTransition(apply)
} else {
  apply()
}
```

- [ ] **Step 3.4: Build**

```bash
npm run build
```

Esperado: sem erros TypeScript.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/navbar.tsx src/components/sidebar-footer-controls.tsx

git commit -m "$(cat <<'EOF'
feat: transição de tema suave via View Transitions API

Toggle claro/escuro usa document.startViewTransition() quando disponível,
com fallback gracioso para browsers sem suporte (Safari < 18, Firefox).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SidebarNav — Active Indicator Animado

**Files:**
- Modify: `src/components/sidebar-nav.tsx`

O active indicator atual é `bg-accent` condicional na classe do Link. Vamos substituí-lo por um `motion.span` com `layoutId` que desliza via FLIP entre itens ao navegar.

- [ ] **Step 4.1: Reescrever sidebar-nav.tsx com motion.span**

Substituir o conteúdo completo de `src/components/sidebar-nav.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  const router = useRouter()

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, kbd, disabled }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={disabled ? '#' : href}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onMouseEnter={() => !disabled && router.prefetch(href)}
            onFocus={() => !disabled && router.prefetch(href)}
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

Nota: `relative` nos elementos filhos (Icon, span, kbd) garante que fiquem acima do `motion.span` absoluto sem precisar de `z-index`.

- [ ] **Step 4.2: Build**

```bash
npm run build
```

Esperado: sem erros.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/sidebar-nav.tsx

git commit -m "$(cat <<'EOF'
feat: sidebar nav active indicator animado com Motion layoutId

O highlight desliza suavemente entre itens via FLIP animation (spring
stiffness 400 damping 35) ao navegar entre rotas.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ClockButton — whileTap + AnimatePresence

**Files:**
- Modify: `src/components/clock-button.tsx`

- [ ] **Step 5.1: Reescrever clock-button.tsx com Motion**

Substituir o conteúdo completo de `src/components/clock-button.tsx`:

```tsx
'use client'

import { motion, AnimatePresence } from 'motion/react'
import { LogIn, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ClockButtonProps {
  isClockedIn: boolean
  onClick: () => void
  loading: boolean
}

const MotionButton = motion(Button)

export function ClockButton({ isClockedIn, onClick, loading }: ClockButtonProps) {
  return (
    <MotionButton
      size="lg"
      onClick={onClick}
      disabled={loading}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={[
        'w-full h-20 text-xl font-bold gap-3',
        'will-change-transform rounded-2xl overflow-hidden',
        isClockedIn
          ? 'bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 animate-glow-red'
          : 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 animate-glow-green',
        'text-white',
      ].join(' ')}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Loader2 className="h-6 w-6 animate-spin" />
          </motion.span>
        ) : isClockedIn ? (
          <motion.span
            key="out"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <LogOut className="h-6 w-6" /> SAÍDA
          </motion.span>
        ) : (
          <motion.span
            key="in"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <LogIn className="h-6 w-6" /> ENTRADA
          </motion.span>
        )}
      </AnimatePresence>
    </MotionButton>
  )
}
```

Nota: `active:scale-95` foi removido das classes CSS pois o `whileTap` do Motion assume essa responsabilidade com spring physics.

- [ ] **Step 5.2: Build**

```bash
npm run build
```

Esperado: sem erros TypeScript. Se `motion(Button)` gerar incompatibilidade de tipos, adicionar `as unknown as typeof Button` no cast:

```tsx
const MotionButton = motion(Button) as typeof Button & ReturnType<typeof motion>
```

Se ainda houver erro, use a abordagem alternativa com wrapper:

```tsx
// Alternativa: wrapper motion.div
<motion.div whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
  <Button ...>...</Button>
</motion.div>
```

- [ ] **Step 5.3: Commit**

```bash
git add src/components/clock-button.tsx

git commit -m "$(cat <<'EOF'
feat: clock button com whileTap e AnimatePresence para transição de estado

- whileTap scale 0.97 com spring physics substitui active:scale-95
- AnimatePresence troca ENTRADA/SAÍDA com slide suave ao mudar estado

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: AnimatePresence para CurrentSession

**Files:**
- Modify: `src/app/dashboard/dashboard-client.tsx`

- [ ] **Step 6.1: Envolver CurrentSession com AnimatePresence**

Em `src/app/dashboard/dashboard-client.tsx`, adicionar o import de Motion no topo do arquivo:

```tsx
import { AnimatePresence, motion } from 'motion/react'
```

Depois, localizar o bloco que renderiza `{session && !isOrphan && <CurrentSession session={session} />}` (linha ~76) e substituir por:

```tsx
<AnimatePresence initial={false}>
  {session && !isOrphan && (
    <motion.div
      key="current-session"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <CurrentSession session={session} />
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 6.2: Build**

```bash
npm run build
```

Esperado: sem erros.

- [ ] **Step 6.3: Commit**

```bash
git add src/app/dashboard/dashboard-client.tsx

git commit -m "$(cat <<'EOF'
feat: AnimatePresence para entrada/saída suave do card de sessão em andamento

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: DailySummaryCard — Stagger nos Cards de Stats

**Files:**
- Modify: `src/components/daily-summary.tsx`

- [ ] **Step 7.1: Adicionar 'use client' e motion ao daily-summary.tsx**

Em `src/components/daily-summary.tsx`, adicionar no topo:

```tsx
'use client'

import { motion } from 'motion/react'
```

(Manter os imports existentes `Card`, `CardContent`, `CardHeader`, `CardTitle`, `formatBRT`, `formatMinutes`.)

- [ ] **Step 7.2: Substituir o grid de BalanceCards por versão com stagger**

Localizar o bloco dentro de `DailySummaryCard`:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
  <BalanceCard title="Hoje" balance={summary.today} />
  <BalanceCard title="Semana" balance={summary.week} />
  <BalanceCard
    title="Mês"
    balance={summary.month}
    cumulativeBalance={summary.month.showCumulativeBalance
      ? summary.month.cumulativeBalance ?? undefined
      : undefined}
  />
</div>
```

Substituir por:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
  {[
    { title: 'Hoje',   balance: summary.today, cumulative: undefined as number | undefined },
    { title: 'Semana', balance: summary.week,  cumulative: undefined as number | undefined },
    {
      title: 'Mês',
      balance: summary.month,
      cumulative: summary.month.showCumulativeBalance
        ? summary.month.cumulativeBalance ?? undefined
        : undefined as number | undefined,
    },
  ].map(({ title, balance, cumulative }, i) => (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <BalanceCard title={title} balance={balance} cumulativeBalance={cumulative} />
    </motion.div>
  ))}
</div>
```

Também remover o `animate-fade-in-up` e o `animationDelay` inline do `<div className="space-y-3 ...">` externo pois o stagger agora é feito pelo Motion:

```tsx
// Antes:
<div className="space-y-3 animate-fade-in-up" style={{ animationDelay: '100ms' }}>

// Depois:
<div className="space-y-3">
```

- [ ] **Step 7.3: Build e testes**

```bash
npm run build && npm test
```

Esperado: build limpo, 61 testes passando.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/daily-summary.tsx

git commit -m "$(cat <<'EOF'
feat: stagger animado nos cards de stats (Hoje/Semana/Mês) via Motion

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Push e Atualizar PR

**Files:** Nenhum arquivo modificado — só operações git/rede.

- [ ] **Step 8.1: Verificar estado do git**

```bash
git status
git log --oneline -8
```

Esperado: working tree limpo, commits da Fase 2.1 listados.

- [ ] **Step 8.2: Push para o remote**

```bash
git push
```

O Netlify detecta o push automaticamente e inicia um novo deploy de preview. A URL de preview permanece a mesma do PR já aberto.

- [ ] **Step 8.3: Confirmar que o PR está atualizado**

```bash
gh pr view --web
```

Verificar que o PR `feat/phase-2-sidebar` mostra os commits novos e que o Netlify está construindo.

---

## Checklist Final (Critérios de Aceitação do Spec)

Após o deploy de preview estar disponível, verificar manualmente:

- [ ] "Configurações" aparece no navbar mobile (< 1024px)
- [ ] Timer do relógio em andamento usa a mesma fonte que os cards de stats
- [ ] Widget "Próximo Faturamento" não aparece na coluna direita
- [ ] Retornar a uma aba visitada nos últimos 30s é instantâneo (sem skeleton)
- [ ] Toggle de tema faz cross-fade suave sem flash
- [ ] Navegar entre abas anima apenas o `<main>` com slide lateral
- [ ] Clicar no botão ENTRADA/SAÍDA tem feedback tátil (leve escala)
- [ ] Trocar entre ENTRADA e SAÍDA anima o texto suavemente
- [ ] Sessão em andamento aparece/desaparece com animação (não pisca)
- [ ] Cards Hoje/Semana/Mês aparecem em sequência (stagger 40ms)
- [ ] Nav highlight desliza entre itens ao navegar
- [ ] Build sem erros TypeScript
- [ ] 61 testes passando
