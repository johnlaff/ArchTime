# ADR 0001 — Bater ponto pela palette/tecla B via event-bus, sem ClockProvider global

**Data:** 2026-06-02 · **Status:** Aceito

## Contexto

A command palette e a tecla `B` precisam disparar "bater ponto". Hoje o estado do clock
(`useClock`) vive só no `DashboardClient`: ele detém o seeding otimista a partir da primeira leitura
do servidor (`seededRef`), a fila offline (IndexedDB) e os writes otimistas. A spec da palette
sugeria "usar o mesmo context do useClock", o que implicaria elevar `useClock` para um provider
global montado em `Providers`.

## Decisão

Manter `useClock` **local** ao `DashboardClient`. A palette/tecla `B` chamam `requestClockToggle()`
(um pequeno barramento em `src/lib/clock-bus.ts`) que: se já estamos no Ponto, despacha o evento
`archtime:clock-toggle` (o dashboard escuta e alterna); se estamos em outra rota, guarda a intenção
e navega ao `/dashboard`, que consome a intenção pendente ao montar.

## Consequências

- **+** Zero custo novo em rotas que hoje não leem sessão (não há fetch de sessão ativa em toda
  rota). Sem mover seeding otimista + fila offline (a mudança de maior risco de regressão do PR).
- **+** Reaproveita o idioma de eventos `archtime:*` já usado no app (`sync-complete`,
  `settings-changed`).
- **−** Bater ponto de outra rota tem um hop de navegação antes de registrar (aceito: o Ponto é o
  lar natural do clock; decisão validada com o usuário).
- A palette descobre o estado (entrada vs. saída) com uma leitura pontual da sessão ativa ao abrir.

Alternativa rejeitada: `ClockProvider` global — mais poderoso (bater de qualquer rota sem hop), mas
move seeding/offline e adiciona leitura por rota; risco desproporcional ao ganho.
