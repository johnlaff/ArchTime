# Design: Fase 3-A — Quick Wins (Grid, Avatar, Nome, Atalhos)

**Data:** 2026-05-22
**Status:** Aprovado
**Branch:** `feat/phase-2-sidebar`

---

## Problema

Quatro problemas visuais/funcionais identificados após deploy do preview:

1. Grid blueprint quase invisível no tema claro
2. Sidebar mostra só email e iniciais — sem nome real, sem foto de perfil do Google
3. Widget de atalhos lista features inexistentes (Modo Foco, Buscar/Cmds)
4. Atalhos exibem símbolos Mac (`⌘`) independente do OS do usuário

---

## Soluções

### A1 — Blueprint grid

**Arquivo:** `src/app/globals.css`

Aumentar opacidade do token de grid no tema claro. O dark já está adequado.

```css
/* Antes: */
--bp-color: oklch(0 0 0 / 0.04);

/* Depois: */
--bp-color: oklch(0 0 0 / 0.08);
```

### A2 — Nome e avatar do usuário

**Fonte dos dados:** `user.user_metadata` do objeto Supabase `User` retornado por `getAuthenticatedUser()`. Google OAuth popula `full_name` e `avatar_url` automaticamente. Já armazenado no DB pelo callback de auth, mas para evitar query extra, lê direto do objeto User.

**Dados extraídos em `AppSidebar` (`src/components/sidebar.tsx`):**

```tsx
const name = user.user_metadata?.full_name as string | undefined
const avatarUrl = user.user_metadata?.avatar_url as string | undefined
const email = user.email ?? ''
const initials = (name ?? email.split('@')[0] ?? '').slice(0, 2).toUpperCase() || '??'
```

**Props de `SidebarFooterControls`:** adicionar `name?: string` e `avatarUrl?: string`.

**UI do footer (`src/components/sidebar-footer-controls.tsx`):**

Substituir o div de avatar por:

```tsx
{/* Avatar */}
{avatarUrl ? (
  <img
    src={avatarUrl}
    alt={name ?? email}
    className="h-7 w-7 rounded-full flex-shrink-0 object-cover"
    referrerPolicy="no-referrer"
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
{/* Texto */}
<div className="flex-1 min-w-0">
  {name && <p className="text-xs font-medium text-foreground truncate">{name}</p>}
  <p className="text-xs text-muted-foreground truncate">{email}</p>
</div>
```

Nota: `referrerPolicy="no-referrer"` é obrigatório para imagens do Google (evita 403).

**Interface atualizada de `SidebarFooterProps`:**
```ts
export interface SidebarFooterProps {
  email: string
  initials: string
  name?: string
  avatarUrl?: string
}
```

### A3 — Remover atalhos de features inexistentes

**Arquivo:** `src/components/col-right.tsx`

Remover da lista `items` de `ShortcutsWidget`:
- `{ desc: 'Buscar / Cmds', key: '⌘K' }` — Phase 4
- `{ desc: 'Modo Foco', key: 'F' }` — Phase 5

Lista final (4 itens):
```ts
const items = [
  { desc: 'Ponto',         key: 'P' },
  { desc: 'Histórico',     key: 'H' },
  { desc: 'Projetos',      key: 'J' },
  { desc: 'Alternar Tema', key: isMac ? '⌘⇧D' : 'Ctrl+Shift+D' },
]
```

### A4 — OS-aware: ⌘ vs Ctrl

**Novo hook: `src/hooks/use-is-mac.ts`**

```ts
'use client'

import { useMemo } from 'react'

export function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return false
    if ('userAgentData' in navigator) {
      return (navigator as Navigator & { userAgentData: { platform: string } })
        .userAgentData.platform === 'macOS'
    }
    return /Mac|iPhone|iPod|iPad/.test(navigator.platform)
  }, [])
}
```

**`ShortcutsWidget` em `src/components/col-right.tsx`:**
- Adicionar `'use client'` (atualmente é Server Component)
- Importar `useIsMac`
- Usar o hook para renderizar o label do tema

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/app/globals.css` | `--bp-color` de `0.04` para `0.08` |
| `src/components/sidebar.tsx` | Extrai `name` e `avatarUrl` de `user.user_metadata`, passa para `SidebarFooterControls` |
| `src/components/sidebar-footer-controls.tsx` | Props `name?` e `avatarUrl?`, UI de avatar/nome atualizada |
| `src/components/col-right.tsx` | Remove 2 atalhos, adiciona `'use client'`, usa `useIsMac` |
| `src/hooks/use-is-mac.ts` | Novo |

---

## Critérios de Aceite

- [ ] Grid blueprint visível no tema claro (contraste adequado)
- [ ] Foto de perfil do Google aparece na sidebar (não apenas iniciais)
- [ ] Nome completo exibido acima do email na sidebar
- [ ] Usuários sem foto veem iniciais como fallback
- [ ] Widget de atalhos não lista "Buscar / Cmds" nem "Modo Foco"
- [ ] Mac: atalho tema mostra `⌘⇧D`; Windows/Linux: `Ctrl+Shift+D`
- [ ] Build sem erros TypeScript
- [ ] 61 testes Vitest passando
