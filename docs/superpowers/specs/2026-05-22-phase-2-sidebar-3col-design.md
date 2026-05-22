# Design: Fase 2 — Sidebar + Layout Desktop 3 Colunas

**Data:** 2026-05-22  
**Status:** Aprovado  
**Fase:** 2 — BLOQUEANTE para Fases 3–5  
**Referência visual:** `ArchTime Design System/proposals/prototype.html`

---

## Problema

O layout atual (`max-w-screen-md mx-auto`) exibe o app como "mobile esticado" em telas maiores. Uma tela 27" usa apenas 768px de largura, desperdiçando 70% do espaço. Arquitetos que usam no escritório têm a pior experiência no contexto mais frequente de uso.

---

## Solução

Layout responsivo de 3 colunas para desktop com RSC + Suspense streaming:

```
≥1280px:  [Sidebar 260px] [Main fluid, max 920px] [ColRight 340px]
≥1024px:  [Sidebar 260px] [Main fluid]
<1024px:  [Navbar top] [Main fullwidth]
```

---

## Arquitetura de Componentes

```
layout.tsx  (Server Component)
├── <Navbar />                         — Client · block lg:hidden
└── <div className="lg:flex lg:min-h-screen">
    ├── <AppSidebar userId={...} />    — Server · hidden lg:flex (260px)
    │   ├── brand mark (SVG inline, estático)
    │   ├── <SidebarNav />             — Client island (usePathname)
    │   ├── <Suspense fallback={<ProjectsSkeleton/>}>
    │   │   └── <ActiveProjects />     — async Server Component
    │   └── <SidebarFooterControls />  — Client island (tema/cor/logout)
    ├── <main className="flex-1 min-w-0">{children}</main>
    └── <ColRight userId={...} />      — Server · hidden xl:flex (340px)
        ├── <TrendWidget />            — async Server, Suspense
        ├── <DistributionWidget />     — async Server, Suspense
        ├── <ShortcutsWidget />        — estático
        └── <BillingWidget />          — placeholder (Fase 8)
```

**Princípios:**
- Zero JS para o shell do layout — CSS grid puro, sem JS para mostrar/ocultar colunas
- Client Components apenas onde necessário: `usePathname`, `useTheme`, `useAccentColor`
- `getAuthenticatedUser()` envolvido em `React.cache()` — 1 execução por request mesmo chamado em múltiplos Server Components
- Suspense em toda seção de dados — layout não bloqueia, dados fazem stream

---

## Sidebar — Conteúdo e Comportamento

### Estrutura (top→bottom)

1. **Brand mark** — logo Compasso=A (32px) + wordmark "ArchTime" + badge "v2"
2. **Navegação** (6 itens com ícone + label + kbd hint)
   - Ponto (Clock, `P`)
   - Histórico (History, `H`)
   - Projetos (FolderOpen, `J`)
   - Configurações (Settings, `S`)
   - Relatórios (BarChart, `R`) — desabilitado até Fase 7
   - Faturamento (CreditCard, `F`) — desabilitado até Fase 8
3. **Projetos ativos** — top 4 por horas do mês corrente (dot colorido + nome + horas)
4. **Rodapé** — avatar + email + ícones: cor de destaque · tema · configurações · logout

### Estados dos nav items
- Default: `text-muted-foreground bg-transparent`
- Hover: `bg-accent/50 text-foreground`
- Active: `bg-accent text-primary font-medium`
- Disabled: `opacity-40 cursor-not-allowed pointer-events-none`

### Posicionamento
```css
position: sticky; top: 0; height: 100vh; overflow-y: auto;
background: var(--card);
border-right: 1px solid var(--border);
```

---

## Coluna Direita — Widgets

| Widget | Dados | Fase |
|---|---|---|
| Tendência | Compara horas desta semana vs semana passada | 2 (real) |
| Distribuição por Projeto | Top projetos do mês com % e horas | 2 (real) |
| Atalhos de Teclado | Lista estática | 2 (estático) |
| Próximo Faturamento | Estimativa se `hourlyRate` configurado | 8 (placeholder) |

Cada widget data-driven é envolvido em `<Suspense>` individual — falha isolada não quebra a coluna.

---

## PageShell

Novo Server Component `src/components/page-shell.tsx`:

```tsx
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[920px] mx-auto w-full px-4 sm:px-6 py-6">
      {children}
    </div>
  )
}
```

Substitui `max-w-screen-md mx-auto px-4 py-6` em todas as pages. `/login` não usa PageShell (permanece centralizado, sem sidebar).

---

## Camada de Dados

### Novo arquivo: `src/lib/server/sidebar-data.ts`

**`fetchActiveProjects(userId: string)`**  
Raw SQL via `prisma.$queryRaw` — uma query com JOIN e agregação:

```sql
SELECT p.id, p.name, p.color,
       COALESCE(SUM(ta.minutes), 0)::int AS month_minutes
FROM projects p
LEFT JOIN time_allocations ta ON ta.project_id = p.id
LEFT JOIN clock_entries ce
  ON ce.id = ta.clock_entry_id
  AND ce.deleted_at IS NULL
  AND ce.entry_date >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
WHERE p.user_id = $1 AND p.is_active = true
GROUP BY p.id, p.name, p.color
ORDER BY month_minutes DESC, p.name
LIMIT 4
```

**`fetchWeekComparison(userId: string)`**  
Retorna `{ thisWeekMinutes, lastWeekMinutes, deltaMinutes, deltaPercent }` — uma query com dois CTEs (esta semana / semana passada). "Semana" = segunda a domingo no timezone `America/Sao_Paulo`, consistente com o restante da app.

**Cache:** padrão `'use cache'` do Next.js 16, consistente com `dashboard/page.tsx`:
```ts
export async function fetchActiveProjects(userId: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`sidebar-${userId}`)
  // query
}
```

**Invalidação:** `revalidateTag(`sidebar-${userId}`, { expire: 0 })` nas rotas de clock-in, clock-out, edição manual e deleção.

---

## Melhorias de DB

### Schema — novos índices em ClockEntry

```prisma
@@index([userId, clockOut, deletedAt])    // busca sessão aberta
@@index([userId, deletedAt, entryDate])   // history sem deletados
```

### Partial index para sessão aberta

O índice parcial `clock_entries_one_open_per_user_idx` já existe na migration `0001_security_integrity` — **não foi necessário criar um novo**. A tentativa de criar um redundante foi removida durante o code review da implementação.

---

## Arquivos Novos e Modificados

### Novos
| Arquivo | Descrição |
|---|---|
| `src/components/sidebar.tsx` | AppSidebar + SidebarNav + ActiveProjects + SidebarFooterControls + ProjectsSkeleton |
| `src/components/col-right.tsx` | ColRight + TrendWidget + DistributionWidget + ShortcutsWidget + BillingWidget |
| `src/components/page-shell.tsx` | Wrapper de largura máxima para pages |
| `src/lib/server/sidebar-data.ts` | fetchActiveProjects + fetchWeekComparison |
| `prisma/migrations/20260522_phase2_indexes/migration.sql` | Partial index |

### Modificados
| Arquivo | Mudança |
|---|---|
| `src/app/layout.tsx` | Estrutura 3-col: Navbar (mobile) + AppSidebar + main + ColRight |
| `prisma/schema.prisma` | +2 `@@index` em ClockEntry |
| `src/app/dashboard/page.tsx` | Envolve conteúdo em `<PageShell>` |
| `src/app/historico/page.tsx` | Envolve conteúdo em `<PageShell>` |
| `src/app/projetos/page.tsx` | Envolve conteúdo em `<PageShell>` |
| `src/app/configuracoes/page.tsx` | Envolve conteúdo em `<PageShell>` |
| `src/app/api/clock/route.ts` | Adiciona `revalidateTag(`sidebar-${userId}`)` no POST (clock-in) |
| `src/app/api/clock/[id]/route.ts` | Adiciona `revalidateTag(`sidebar-${userId}`)` no PATCH (clock-out) e PUT (edição manual) |

---

## Performance

- **Zero JS para layout** — CSS grid puro com Tailwind breakpoints (`lg:flex`, `hidden lg:flex`, `hidden xl:flex`)
- **Hydration mínima** — Client Components apenas para `SidebarNav`, `SidebarFooterControls`
- **Streaming** — Suspense por seção de dados, skeleton imediato
- **Cache** — `unstable_cache` com 60s revalidate + tag-based invalidation em writes
- **CSS containment** — `contain: layout style paint` na sidebar e col-right
- **Prefetch** — nav items fazem `router.prefetch` no hover/focus
- **Partial index** — `idx_clock_open_session` elimina full-scan na verificação de sessão aberta

---

## Critérios de Aceitação

- [ ] ≥1024px: sidebar visível, navbar mobile oculta
- [ ] <1024px: navbar mobile visível, sidebar oculta
- [ ] ≥1280px: coluna direita visível
- [ ] Navegação via sidebar atualiza rota corretamente
- [ ] Link ativo tem estado visual correto em todas as rotas
- [ ] Sidebar permanece sticky ao fazer scroll no conteúdo
- [ ] Projetos ativos mostram dados reais com horas do mês
- [ ] Tendência mostra comparação real de horas
- [ ] Distribuição mostra projetos com barras e percentuais corretos
- [ ] Logout funciona via sidebar
- [ ] Tema toggle funciona via sidebar
- [ ] Accent picker funciona via sidebar
- [ ] `/login` sem sidebar (layout centralizado intacto)
- [ ] PWA funciona normalmente após mudança de layout
- [ ] Sem layout shift visível durante carregamento de dados
- [ ] Índices novos aplicados via migration

---

## Não incluso nesta fase

- Drawer de personalização (Fase 5)
- Command palette (Fase 4)
- Modo foco (Fase 5)
- Atalhos de teclado funcionais (Fase 4) — kbd hints na UI são decorativos por enquanto
- Coluna direita com faturamento real (Fase 8)
