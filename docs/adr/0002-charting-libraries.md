# ADR 0002 — Bibliotecas de visualização: Recharts (barras) + react-activity-calendar (heatmap)

**Data:** 2026-06-02 · **Status:** Aceito

## Contexto

O painel de atividade precisa de duas visualizações: **barras semanais** (7 barras + linha de meta)
e **heatmap** estilo GitHub. Avaliamos custom/CSS puro vs. libs mantidas. O projeto é um PWA
mobile-first com meta dura de performance ("navegação JAMAIS deve degradar").

## Decisão

Usar bibliotecas mantidas e padrão de mercado, conforme escolha do usuário (priorizar estado da arte
e manutenibilidade sobre o menor bundle):

- **Barras semanais → shadcn `chart` (Recharts) + `ReferenceLine`.** É o bloco oficial "bar chart
  with target line" do shadcn/new-york; tooltip/responsivo/a11y vêm prontos.
- **Heatmap → `react-activity-calendar` (v3.2).** Mantido (2026), SSR/Next ok, tema por 5 cores
  explícitas (tintamos com `oklch(from var(--primary) ...)`; o lib não tem parser de cor, então
  CSS vars passam direto pro `fill`). Usa o **tooltip embutido** (`tooltips` prop, via @floating-ui)
  — sem dep de tooltip extra.
- **Command palette → shadcn `command` (cmdk).** Padrão de indústria (Linear/Raycast/Vercel).

## Consequências

- **+** Componentes confiáveis, acessíveis e familiares; menos código próprio para manter.
- **−** ~100KB+ gz de JS (Recharts) e uma dep nova no heatmap (`react-activity-calendar`, que traz
  `@floating-ui/react`). **Mitigação obrigatória:** o `ActivityPanel` inteiro é carregado via
  `next/dynamic` (lazy), fora do bundle inicial da rota — a navegação instantânea (PR #10) não
  regride. A command palette idem (só carrega ao abrir).
- O accent é o token `--primary` (não `--accent`, que é a superfície suave). Heatmap e barras
  tintam a partir de `--primary`.

Alternativa rejeitada: heatmap/barras custom (zero deps, mais leve) — recusada pelo usuário em favor
do padrão de mercado. `@uiw/react-heat-map` rejeitado por exigir `next-remove-imports` no Next 16.
