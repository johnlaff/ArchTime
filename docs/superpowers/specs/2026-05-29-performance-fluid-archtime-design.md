# Design — "ArchTime fluida": performance e responsividade (2026-05-29)

## Objetivo

Toda interação e navegação devem parecer instantâneas (delay nulo ou imperceptível),
dentro das restrições atuais (Netlify free tier + Supabase, sem gasto de infra).

### Critérios de sucesso (medidos no Deploy Preview da Netlify, contexto anônimo)
- **INP < 200 ms** em todas as interações (clique/tap/tecla) — métrica de "instantâneo" do CWV 2026.
- Navegação com **conteúdo perceptivelmente instantâneo quando a função está quente** (não só skeleton).
- **Dashboard e Projetos não dependem da função SSR fria** para a primeira pintura de dados.
- **LCP < 2,5 s**, **CLS < 0,1**.
- 0 regressões de crash de navegação (o fix do `removeChild` permanece válido).

## Estado atual (auditoria 2026-05-29)

Bom hoje: skeleton de nav instantâneo (~60 ms); bater ponto é otimista + fila offline;
dados com `use cache`/`cacheTag`; auth local (`getClaims`).

Gargalos (ordenados por impacto na percepção):
1. **Cold start ~5–10 s** — função SSR grande (Prisma) no Netlify free tier.
2. **Latência cross-região** — funções `us-east-2` (Ohio) ↔ Supabase `sa-east-1` (SP), ~120–150 ms+ por query não cacheada.
3. **`prefetch={false}`** nos links — resíduo do diagnóstico errado do bug; conteúdo só busca no clique (~1–2 s quente).
4. **Escritas não-otimistas** — salvar Configurações e CRUD de Projetos esperam o servidor.
5. **React Compiler desligado** — otimização automática de re-render (→ INP) disponível e não usada.
6. **React #419 intermitente** — fallback de client render sob `cacheComponents` (não-fatal).

Confirmado: **RLS habilitado + policies em todas as tabelas de dados** (`projects`, `clock_entries`,
`time_allocations`, `user_settings`, `hour_bank`, `users`) → leituras cliente→Supabase direto são seguras.

## Abordagem escolhida: **B — Equilíbrio** (free tier; quick wins + refator faseado de leituras; um PR verificado em incrementos)

Alternativas consideradas: **A** (só quick wins, sem mexer em data layer — não ataca cold start nas leituras);
**C** (local-first: agregações em RPC + IndexedDB + realtime — maior ganho, mas reescrita excessiva p/ 2 usuários agora).

---

## Design por tema

### Tema 1 — Navegação instantânea
**1.1 Reativar prefetch.** Remover `prefetch={false}` de `sidebar-nav.tsx` e `navbar.tsx`
(voltar ao default `<Link>` prefetch). Atualizar/remover o teste-guarda obsoleto do #86182 em
`review-feedback-source.test.ts` (linhas ~93-105) e o comentário stale no topo do `sidebar-nav.tsx`.
Sob `cacheComponents`, o prefetch traz o shell estático + segmentos cacheados → conteúdo pronto no hover.
- **Verificação:** preview oracle — 0 crashes; tempo de conteúdo na nav cai vs. baseline; hover dispara prefetch (esperado).

**1.2 View Transitions.** Habilitar `experimental.viewTransition` no `next.config.ts`; cross-fade
suave automático nas navegações de rota (+ CSS leve). Manter sutil para não conflitar com as animações Framer Motion existentes.
- **Verificação:** navegação suave; sem novo crash/erro de console no preview.

### Tema 2 — Eliminar cold-start/cross-região nas leituras quentes (peça arquitetural)
Mover leituras **simples** para **cliente→Supabase direto (BR→BR)** via `@/lib/supabase/client`,
escopadas por RLS, com um **cache leve no cliente** (stale-while-revalidate + dedup).

**2.1 Camada de leitura no cliente.** Criar `src/lib/client-data.ts` com funções tipadas de leitura
(`fetchActiveSession()`, `fetchProjects()`) usando o browser client + sessão do usuário (RLS aplica `auth.uid()`).
Cache: hook mínimo `useSupabaseQuery(key, fetcher)` (in-memory + revalidate on focus/reconnect, sem nova dependência pesada).

**2.2 Dashboard.** A página vira **shell estático instantâneo** (sem fetch no SSR) + componente cliente que busca:
- **sessão ativa** e **lista de projetos** direto do Supabase (BR→BR, com cache);
- **resumo diário** (agregação) via `/api/clock/summary` (rota cacheada) carregado no cliente com skeleton.

Resultado: a página **não depende mais da função fria para pintar nem para sessão/projetos** (vêm de SP rápido);
apenas o card de resumo aguarda a API cacheada. (Mover o resumo p/ Supabase RPC fica para a fase C.)

**2.3 Projetos.** Lista de projetos da página `/projetos` via leitura client-direct + cache.

Escopo intencional: **agregações (histórico, resumo, banco de horas, comparação semanal) continuam
no servidor cacheadas** (JOINs/SQL complexos; vão para Supabase RPC numa fase C futura, se desejado).
Sidebar (`ActiveProjects`) permanece server-side cacheada (persiste entre navegações; busca uma vez).

- **Verificação:** isolamento por usuário (RLS) testado; dashboard/projetos carregam dados sem depender da função fria; sem vazamento entre contas.

### Tema 3 — Escritas otimistas (feedback instantâneo)
**3.1 Configurações** (`configuracoes-client.tsx`): aplicar mudança na hora + persistir em background
(`useOptimistic`/estado otimista), revertendo em erro; remover o bloqueio `disabled={saving}` do fluxo feliz.
**3.2 CRUD de Projetos** (`projetos-client.tsx`): criar/editar/arquivar atualizam a lista local
imediatamente, persistem via API em background, reconciliam/revertem em erro.
Ponto (entrada/saída) já é otimista — manter.
- **Verificação:** UI responde < 200 ms; erro reverte corretamente (teste com falha simulada).

### Tema 4 — Performance de runtime (INP)
**4.1 React Compiler.** Adicionar `babel-plugin-react-compiler` + `experimental.reactCompiler: true`.
Memoiza re-renders automaticamente. Verificar build (webpack+babel) e os 114 testes; é opt-in e pula
componentes inseguros (baixo risco; fácil reverter).
**4.2 Trim de JS no cliente.** `LazyMotion` + componentes `m` no Framer Motion (reduz o bundle de motion
de ~34 kb para ~5 kb + features) em providers/dashboard/clock-button/daily-summary/sidebar-nav;
lazy-load de componentes não-críticos (ex.: conteúdo do popover de cor, install-prompt).
- **Verificação:** animações intactas; bundle do cliente menor; INP medido.

### Tema 5 — Medição (no mesmo PR)
Recriar o harness Playwright (sessão mintada via admin) para medir **tempo de conteúdo na navegação**
e **INP** antes/depois, no Deploy Preview. Registrar números no PR. (Scripts de medição são temporários,
fora de `src/`, e removidos antes do merge — eles mintam sessão a partir da service-role key.)

---

## Fora de escopo (agora)
- Gasto de infra (free tier escolhido); mover região da função / keep-warm (precisa plano pago).
- Agregações em Supabase RPC + local-first/IndexedDB/realtime (fase C futura).
- Turbopack (é DX, não runtime; risco com Serwist) — manter `--webpack`.
- React #419: monitorar; se as mudanças não o eliminarem, documentar (não-fatal).

## Riscos e mitigação
- **PR grande:** implementar em commits verificados; verificação completa no preview antes do merge.
- **Leituras client-direct (RLS):** testar isolamento por usuário; skeletons já existem para o estado de loading.
- **React Compiler:** verificar build + testes; reversível por flag.
- **Reativar prefetch:** confirmar que o crash continua corrigido e medir taxa de #419 no preview.
- **LazyMotion:** verificar todas as animações após a conversão.

## Plano de verificação
- `npm test` (manter 114 passando + novos testes onde fizer sentido).
- Build de produção local + oracle Playwright (0 crashes, tempos antes/depois).
- Deploy Preview da Netlify: oracle em contexto anônimo; INP/nav/cold/quente; confirmar build sem erro.
- Critérios de sucesso acima atingidos antes do merge.

## Rollout
Um PR (`perf/fluid-archtime`) com commits temáticos verificados; preview validado; merge após aprovação.
