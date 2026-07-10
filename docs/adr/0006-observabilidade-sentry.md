# ADR 0006 — Observabilidade com Sentry + health check

**Data:** 2026-07-10 · **Status:** Aceito

## Contexto

Um HTTP 500 no clock-out em produção ficou invisível até a usuária principal reclamar que não
conseguia encerrar a sessão. O app não tinha **nenhuma** captura de erro (`grep` de
`console.error`/`captureException` nas rotas de API retornava zero) nem health check
(`healthCheckPath` do App Service estava vazio). A cegueira a falhas de produção era o risco
operacional #1 da auditoria: o próximo erro também chegaria por reclamação, não por alerta.

## Decisão

Integrar **`@sentry/nextjs`** (plano Team patrocinado via GitHub Student Pack) para error tracking
server e client, e expor um health check.

- **Server:** `Sentry.init` no `src/instrumentation.ts` (`register()`), preservando a validação do
  keyring de HMAC no boot. `onRequestError = captureRequestError` cobre route handlers, server
  actions e RSC — inclui o 500 de clock-out que originou esta decisão.
- **Client:** `src/instrumentation-client.ts` (convenção do Next 16) + `onRouterTransitionStart`.
- **`enabled` só em produção** (`NODE_ENV === 'production'`) e **`sendDefaultPii: false`** — nenhum
  dado da usuária (IP, headers, corpo) sai do app.
- **Tunnel:** `tunnelRoute: '/monitoring'` roteia os eventos pelo próprio domínio (same-origin) —
  evita ad-blockers e mantém a CSP intacta (`connect-src 'self'`). Exige que `api/health` e
  `monitoring` fiquem na allowlist do matcher do `src/proxy.ts`, senão são redirecionados ao login.
- **Falhas silenciosas por design viram visíveis:** os recálculos fail-safe do `hour-bank`
  (`safeRecalculateHourBankFor*`) engolem o erro de propósito (o cache é derivado e roda após o
  commit da mutação primária); agora reportam ao Sentry **sem** deixar de engolir. Era exatamente a
  classe de falha que o `onRequestError` (que só captura erro que propaga) não pegaria.
- **Source maps:** subidos no build da imagem quando `SENTRY_AUTH_TOKEN` (build secret) está
  presente; pulados no CI e no dev sem o token. O `release` é o SHA do commit (`SENTRY_RELEASE`),
  já que o `.git` não entra no contexto do build Docker.
- **Segredos:** `NEXT_PUBLIC_SENTRY_DSN` é público (inlinado no bundle em build time, via build-arg);
  `SENTRY_AUTH_TOKEN` é segredo, entra só como docker build secret (não persiste na imagem).
- **Health check:** `GET /api/health` (público, `SELECT 1` no banco) para o probe do App Service e o
  uptime monitor do Sentry. Usa `await connection()` (não `force-dynamic`, incompatível com
  `cacheComponents`). O App Service passa a apontar `healthCheckPath = /api/health`.

## Consequências

- **+** Erros de produção passam a gerar alerta em vez de esperar reclamação.
- **+** As falhas silenciosas do `hour-bank` ficam observáveis.
- **+** O App Service recicla a instância se ela travar (antes o `healthCheckPath` era vazio).
- **−** Com 1 instância B1, um banco fora do ar por tempo prolongado (`/api/health` = 503) pode levar
  a Azure a reciclar a instância; trade-off aceitável para um app pessoal.
- O plano patrocinado (50k erros/mês, 5 TB logs, 1 uptime monitor) vale enquanto o mantenedor for
  estudante; em **2027-07-10** rebaixa para o plano Developer grátis (5k erros/mês), suficiente para
  um app de uma usuária. Nenhuma ação necessária na virada.

## Alternativas rejeitadas

- **Datadog** (Pro grátis por 2 anos no Student Pack): observabilidade completa, mas pesado demais
  para um app de uma usuária e caro quando os 2 anos acabam. Guardado para se o produto crescer.
- **Azure Application Insights** (nativo do App Service, coberto por créditos): ótimo para APM/infra,
  mas a DX de error tracking + alerta é mais fraca que a do Sentry para o problema em questão.
- **Self-host** (OpenTelemetry + coletor): custo operacional injustificável nesta fase.
