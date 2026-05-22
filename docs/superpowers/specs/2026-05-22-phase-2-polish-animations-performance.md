# Design: Fase 2.1 — Polimento de Performance, Animações e Fluidez

**Data:** 2026-05-22  
**Status:** Aprovado  
**Fase:** 2.1 — Polimento pós-deploy da Fase 2  
**Branch:** `feat/phase-2-sidebar`

---

## Problema

Após o deploy de preview da Fase 2, o usuário identificou 6 pontos de melhoria:

1. Navegação entre abas com delay perceptível; retorno a aba visitada recarrega do zero
2. Label "Config" no navbar mobile (deveria ser "Configurações")
3. Timer do relógio usa `font-mono` (Geist Mono) enquanto os cards de stats usam `font-sans` (Geist) — inconsistente
4. Widget "Próximo Faturamento" expõe feature incompleta (Fase 8) de forma não profissional
5. Transição de tema claro/escuro é instantânea (flash brusco)
6. Ausência de animações fluidas e micro-interações de qualidade

**Direção:** sem redesign visual — preservar a identidade atual e evoluir qualidade de movimento, velocidade de navegação e micro-interações.

---

## Solução

Cinco grupos de mudanças, todos no branch `feat/phase-2-sidebar` existente.

---

## 1. Correções Imediatas

| Arquivo | Linha | Mudança |
|---|---|---|
| `src/components/navbar.tsx` | 29 | `'Config'` → `'Configurações'` |
| `src/components/current-session.tsx` | 38 | Remove `font-mono` — timer usa Geist Sans como os stats |
| `src/components/col-right.tsx` | 138–142 | Remove o `<Widget title="Próximo Faturamento">` inteiro |

---

## 2. Performance de Navegação

**Causa raiz:** `staleTimes.dynamic = 0` (padrão Next.js 15/16) — RSC payload não é cacheado no cliente, então toda navegação a uma rota dinâmica re-faz o fetch do servidor, mesmo para rotas recentemente visitadas.

**Fix:** `next.config.ts`

```ts
experimental: {
  viewTransition: true,
  staleTimes: { dynamic: 30, static: 180 },
}
```

- `dynamic: 30` — RSC payload de rotas dinâmicas fica em memória no cliente por 30s. Retornar a uma aba visitada recentemente é instantâneo (zero network).
- `static: 180` — rotas estáticas ficam por 3 minutos.
- O `prefetch` no hover (`router.prefetch()`) já existe em `sidebar-nav.tsx` e `navbar.tsx` e passa a funcionar de forma efetiva com esse cache.
- Tradeoff: dados podem ter até 30s de stale. Aceitável porque writes (clock-in/out) invalidam o cache server-side via `revalidateTag` e o estado do relógio é client-side via `useClock`.

---

## 3. Transição de Tema Suave

**Causa raiz:** `next-themes` alterna a classe `.dark` no `<html>` sincronamente — todos os valores CSS mudam de uma vez, causando flash visual.

**Fix:** Envolver a mudança de tema em `document.startViewTransition()` nos dois handlers de toggle:

```ts
// navbar.tsx e sidebar-footer-controls.tsx
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

Efeito: cross-fade suave de ~300ms entre temas. Fallback gracioso para browsers sem suporte (Safari < 18, Firefox sem flag).

---

## 4. Motion — Micro-interações

**Pacote:** `motion` (ex-Framer Motion v11+, ~30KB gzip). Somente Client Components — sem impacto em RSC.

### 4.1 SidebarNav — active indicator deslizante

Substituir o `bg-accent` condicional por um `motion.span` com `layoutId="nav-indicator"` que desliza entre os itens via FLIP:

```tsx
{isActive && (
  <motion.span
    layoutId="nav-indicator"
    className="absolute inset-0 rounded-lg bg-accent"
    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
  />
)}
// O Link precisa de position: relative para o absolute funcionar
```

### 4.2 ClockButton — whileTap + AnimatePresence

```tsx
<motion.button
  whileTap={{ scale: 0.97 }}
  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
>
```

E `AnimatePresence` para trocar suavemente o label/ícone entre estados (clock-in/out).

### 4.3 CurrentSession — entrada/saída suave

```tsx
<AnimatePresence>
  {session && !isOrphan && (
    <motion.div
      key="current-session"
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <CurrentSession session={session} />
    </motion.div>
  )}
</AnimatePresence>
```

### 4.4 DailySummaryCard — stagger nos stats

```tsx
{[today, week, month].map((stat, i) => (
  <motion.div
    key={stat.title}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
  >
    <BalanceCard ... />
  </motion.div>
))}
```

### 4.5 Accent picker popover — entrada suave

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95, y: -4 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
>
```

---

## 5. Transições de Rota via View Transitions CSS

`experimental.viewTransition: true` já está ativo no `next.config.ts`. O Next.js envolve navegações em `document.startViewTransition()` automaticamente.

Para que **apenas o `<main>` anime** (sidebar e col-right ficam estáticos):

```css
/* globals.css */
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

Usa os tokens de motion já definidos em `globals.css` (`--ease-out-expo`).

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `next.config.ts` | `staleTimes: { dynamic: 30, static: 180 }` |
| `src/app/globals.css` | View transition CSS para `main-content` |
| `src/components/navbar.tsx` | Label "Configurações" + handleThemeToggle com startViewTransition |
| `src/components/sidebar-footer-controls.tsx` | handleThemeToggle com startViewTransition |
| `src/components/current-session.tsx` | Remove `font-mono` |
| `src/components/col-right.tsx` | Remove BillingWidget |
| `src/components/sidebar-nav.tsx` | motion.span `layoutId="nav-indicator"` |
| `src/components/clock-button.tsx` | motion.button whileTap + AnimatePresence |
| `src/app/dashboard/dashboard-client.tsx` | AnimatePresence para CurrentSession |
| `src/components/daily-summary.tsx` | stagger nos 3 BalanceCards |

**Novo:** nenhum arquivo criado — apenas modificações.

---

## Critérios de Aceitação

- [ ] "Configurações" aparece no navbar mobile
- [ ] Timer do relógio usa mesma fonte que os cards de stats
- [ ] Widget "Próximo Faturamento" não aparece na coluna direita
- [ ] Retornar a uma aba visitada nos últimos 30s é instantâneo (sem skeleton)
- [ ] Toggle de tema faz cross-fade suave (~300ms) sem flash
- [ ] Navegar entre abas anima apenas o `<main>` com slide lateral suave
- [ ] Clicar no botão de ponto tem feedback tátil visual (scale 0.97)
- [ ] Sessão em andamento aparece/desaparece com animação suave
- [ ] Cards de stats aparecem em stagger ao carregar
- [ ] Nav highlight desliza entre itens ao navegar
- [ ] Tudo funciona sem Motion em SSR (somente Client Components)
- [ ] Build passa sem erros TypeScript

---

## Não incluso

- Redesign visual — identidade atual preservada
- Novas páginas ou features
- Animações em Server Components (não suportado)
- Suporte a `prefers-reduced-motion` — pode ser adicionado depois via `useReducedMotion()` do Motion
