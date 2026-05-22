# Fase 3-A — Quick Wins (Grid, Avatar, Nome, Atalhos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quatro melhorias visuais/funcionais independentes: grid blueprint mais visível no tema claro, exibição de foto e nome do usuário na sidebar, remoção de atalhos para features inexistentes, e atalhos de teclado exibidos de forma OS-aware (⌘ no Mac, Ctrl no Windows/Linux).

**Architecture:** Todas as mudanças são em Client Components ou Server Components existentes — sem novos arquivos de rota. O hook `useIsMac` é o único novo arquivo. Avatar e nome vêm de `user.user_metadata` do objeto Supabase `User` (Google OAuth popula `full_name` e `avatar_url` automaticamente).

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth, Tailwind CSS 4.

---

## Mapa de Arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/app/globals.css` | Modificar | `--bp-color` de `0.04` → `0.08` |
| `src/hooks/use-is-mac.ts` | Criar | Hook OS detection |
| `src/components/col-right.tsx` | Modificar | `'use client'` em `ShortcutsWidget`, remove features inexistentes, usa `useIsMac` |
| `src/components/sidebar.tsx` | Modificar | Extrai `name` e `avatarUrl` de `user.user_metadata` |
| `src/components/sidebar-footer-controls.tsx` | Modificar | Props `name?` e `avatarUrl?`, UI de avatar/nome |

---

## Task 1: Blueprint grid visível no tema claro

**Files:**
- Modify: `src/app/globals.css:128`

- [ ] **Step 1.1: Aumentar opacidade do token de grid**

Em `src/app/globals.css`, linha 128:

```css
/* Antes: */
--bp-color:      oklch(0 0 0 / 0.04);

/* Depois: */
--bp-color:      oklch(0 0 0 / 0.08);
```

Apenas essa linha muda. `--bp-color-dark` (linha 129) permanece `oklch(1 0 0 / 0.025)` — já está correto.

- [ ] **Step 1.2: Build**

```bash
cd C:\Users\John\Documents\ArchTime\pontoarq\.worktrees\feat-phase-2-sidebar
npm run build
```

Esperado: sem erros.

- [ ] **Step 1.3: Commit**

```bash
git add src/app/globals.css

git commit -m "$(cat <<'EOF'
fix: aumenta visibilidade do grid blueprint no tema claro (0.04 → 0.08)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Hook useIsMac + ShortcutsWidget OS-aware sem features inexistentes

**Files:**
- Create: `src/hooks/use-is-mac.ts`
- Modify: `src/components/col-right.tsx`

- [ ] **Step 2.1: Criar src/hooks/use-is-mac.ts**

```ts
'use client'

import { useMemo } from 'react'

export function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return false
    if ('userAgentData' in navigator) {
      return (
        navigator as Navigator & { userAgentData: { platform: string } }
      ).userAgentData.platform === 'macOS'
    }
    return /Mac|iPhone|iPod|iPad/.test(navigator.platform)
  }, [])
}
```

- [ ] **Step 2.2: Extrair ShortcutsWidget para arquivo Client Component separado**

`col-right.tsx` é um Server Component (`async function ColRight()`). `useIsMac` requer um Client Component. A solução: extrair `ShortcutsWidget` para um novo arquivo.

**2.2a — Criar `src/components/shortcuts-widget.tsx`:**

**Criar `src/components/shortcuts-widget.tsx`:**

```tsx
'use client'

import { useIsMac } from '@/hooks/use-is-mac'

export function ShortcutsWidget() {
  const isMac = useIsMac()
  const items = [
    { desc: 'Ponto',         key: 'P' },
    { desc: 'Histórico',     key: 'H' },
    { desc: 'Projetos',      key: 'J' },
    { desc: 'Alternar Tema', key: isMac ? '⌘⇧D' : 'Ctrl+Shift+D' },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(({ desc, key }) => (
        <div key={desc} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{desc}</span>
          <kbd className="font-mono bg-muted border border-border rounded px-1.5 py-px text-[10px]">
            {key}
          </kbd>
        </div>
      ))}
    </div>
  )
}
```

**2.2b — Atualizar `col-right.tsx`:**
- Remover a função `ShortcutsWidget` local (linhas 91–110)
- Adicionar import no topo do arquivo: `import { ShortcutsWidget } from './shortcuts-widget'`
- O uso `<ShortcutsWidget />` na linha 134 permanece igual — sem outras alterações

- [ ] **Step 2.3: Build**

```bash
npm run build
```

Esperado: sem erros TypeScript. O `'use client'` em `shortcuts-widget.tsx` é compatível com ser importado em um Server Component (`col-right.tsx`).

- [ ] **Step 2.4: Testes**

```bash
npm test
```

Esperado: 61 testes passando.

- [ ] **Step 2.5: Commit**

```bash
git add src/hooks/use-is-mac.ts src/components/shortcuts-widget.tsx src/components/col-right.tsx

git commit -m "$(cat <<'EOF'
feat: atalhos OS-aware e sem features inexistentes

- useIsMac hook: detecta Mac via userAgentData + fallback navigator.platform
- ShortcutsWidget: remove Buscar/Cmds e Modo Foco (fases 4/5)
- Exibe Ctrl+Shift+D no Windows/Linux, ⌘⇧D no Mac

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Nome e avatar do usuário na sidebar

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/components/sidebar-footer-controls.tsx`

- [ ] **Step 3.1: Extrair name e avatarUrl em AppSidebar**

Em `src/components/sidebar.tsx`, substituir as linhas de extração do usuário (atualmente linhas 71–72):

```tsx
// Antes:
const email = user.email ?? ''
const initials = email.split('@')[0]?.slice(0, 2).toUpperCase() || '??'

// Depois:
const email = user.email ?? ''
const name = user.user_metadata?.full_name as string | undefined
const avatarUrl = user.user_metadata?.avatar_url as string | undefined
const initials = ((name ?? email.split('@')[0] ?? '')).slice(0, 2).toUpperCase() || '??'
```

E passar as novas props para `SidebarFooterControls` (linha 93 aprox):

```tsx
// Antes:
<SidebarFooterControls email={email} initials={initials} />

// Depois:
<SidebarFooterControls email={email} initials={initials} name={name} avatarUrl={avatarUrl} />
```

- [ ] **Step 3.2: Atualizar interface e UI em sidebar-footer-controls.tsx**

Substituir a interface `SidebarFooterProps` (linha 17):

```tsx
// Antes:
export interface SidebarFooterProps {
  email: string
  initials: string
}

// Depois:
export interface SidebarFooterProps {
  email: string
  initials: string
  name?: string
  avatarUrl?: string
}
```

Atualizar os parâmetros da função (linha 22):

```tsx
// Antes:
export function SidebarFooterControls({ email, initials }: SidebarFooterProps) {

// Depois:
export function SidebarFooterControls({ email, initials, name, avatarUrl }: SidebarFooterProps) {
```

Substituir o bloco de "User info" (linhas 60–70 aprox, o `<div className="flex items-center gap-2 px-1">`):

```tsx
{/* User info */}
<div className="flex items-center gap-2 px-1">
  {avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name ?? email}
      referrerPolicy="no-referrer"
      className="h-7 w-7 rounded-full flex-shrink-0 object-cover"
    />
  ) : (
    <div
      className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      aria-hidden="true"
    >
      {initials}
    </div>
  )}
  <div className="flex-1 min-w-0">
    {name && (
      <p className="text-xs font-medium text-foreground truncate leading-tight">{name}</p>
    )}
    <p className={`text-xs text-muted-foreground truncate ${name ? 'leading-tight' : ''}`}>
      {email}
    </p>
  </div>
</div>
```

- [ ] **Step 3.3: Build**

```bash
npm run build
```

Esperado: sem erros TypeScript. `user.user_metadata` é tipado como `Record<string, unknown>` no Supabase SDK — o cast `as string | undefined` é necessário e correto.

- [ ] **Step 3.4: Testes**

```bash
npm test
```

Esperado: 61 testes passando.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/sidebar.tsx src/components/sidebar-footer-controls.tsx

git commit -m "$(cat <<'EOF'
feat: exibe nome e foto de perfil do Google OAuth na sidebar

- Lê user.user_metadata.full_name e avatar_url do objeto Supabase User
- Mostra img do Google com fallback para iniciais
- Exibe nome acima do email (quando disponível)
- referrerPolicy=no-referrer evita 403 nas imagens do Google

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Push

- [ ] **Step 4.1: Verificar estado git**

```bash
git log --oneline -6
git status
```

Esperado: working tree limpo, 3 commits novos da Fase 3-A.

- [ ] **Step 4.2: Push**

```bash
git push
```

Netlify inicia deploy de preview automaticamente.

---

## Checklist de Aceite

- [ ] Grid blueprint visível no tema claro (contraste duplo do que antes)
- [ ] Foto de perfil do Google aparece no footer da sidebar
- [ ] Usuários sem foto OAuth veem iniciais como fallback
- [ ] Nome completo (`full_name`) exibido acima do email quando disponível
- [ ] Widget de atalhos lista apenas: Ponto, Histórico, Projetos, Alternar Tema
- [ ] Mac: atalho tema mostra `⌘⇧D`; Windows/Linux: `Ctrl+Shift+D`
- [ ] `npm run build` limpo
- [ ] `npm test` — 61 testes passando
