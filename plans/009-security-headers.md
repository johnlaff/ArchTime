# Plan 009: Adicionar headers de hardening (CSP report-only primeiro) sem quebrar PWA/Supabase

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- next.config.ts netlify.toml src/app/layout.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

Nenhuma resposta do app carrega headers de hardening: não há `[[headers]]` no `netlify.toml` nem `headers()` no `next.config.ts`. Para um PWA autenticado com dados de horas e faturamento, isso remove a camada padrão de defesa em profundidade: sem `X-Frame-Options` (clickjacking), sem `Referrer-Policy`, sem CSP para conter o raio de explosão de um eventual XSS (ex.: regressão de lib ou um caminho de render de texto livre como `notes`). O plano introduz os headers seguros imediatamente e a CSP em **Report-Only** — porque o app tem restrições reais que uma CSP estrita quebraria: script inline anti-flash no `<head>`, service worker Serwist, conexões ao Supabase e Google Fonts.

## Current state

- `next.config.ts` (14 linhas, completo):

```ts
import withSerwist from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
}

export default withSerwist({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js' })(nextConfig)
```

- `netlify.toml` — sem bloco `[[headers]]`; deploy via `@netlify/plugin-nextjs` (o `headers()` do Next é respeitado pelo plugin).
- Restrições que a CSP precisa acomodar:
  - **Script inline anti-flash** em `src/app/layout.tsx:62-130` (`dangerouslySetInnerHTML`) — exige `'unsafe-inline'` em `script-src` (nonce exigiria reestruturar o layout; fora do escopo).
  - **Service worker** `public/sw.js` + registro — same-origin, coberto por `'self'`; `worker-src 'self'`.
  - **Supabase**: leituras client-direct e auth via `https://*.supabase.co` (REST + websocket `wss://*.supabase.co`) → `connect-src`.
  - **Google Fonts**: `next/font` faz self-host dos WOFF (sem CSS externo em runtime), mas o SW tem runtime cache para `fonts.googleapis.com` (`src/app/sw.ts:19`) — inclua `https://fonts.googleapis.com` em `connect-src`/`style-src` e `https://fonts.gstatic.com` em `font-src` por segurança.
  - **Estilos inline**: Tailwind 4 em build não exige, mas Recharts/estilos de componentes usam style attributes → `style-src 'self' 'unsafe-inline'`.
  - **Imagens**: `/api/icon` (same-origin), data: URIs (favicon do browser-accent usa `data:image/svg+xml`) → `img-src 'self' data:`.
- Fluxo de validação do repo (AGENTS.md): mudanças assim devem ser validadas em deploy preview da Netlify antes de produção; teste manual de preview em janela anônima (o SW pode servir bundle velho).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Dev server | `npm run dev` | app sobe em localhost:3000 |
| Ver headers | `curl -sI http://localhost:3000/login \| grep -i -E "x-frame\|referrer\|content-security\|x-content"` | 4 headers presentes |
| Build | `npm run build` | exit 0 |
| Suíte | `npm test` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `next.config.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/app/layout.tsx` — NÃO converta o script inline para nonce neste plano.
- `netlify.toml` — headers ficam no Next (funcionam em dev e produção; um só lugar).
- `src/proxy.ts` — não é o lugar para headers estáticos.
- Promover a CSP de Report-Only para enforce — decisão do OPERADOR após ler os relatórios (ver Steps).

## Git workflow

- Branch: `advisor/009-security-headers`
- Commit: `security(headers): X-Frame-Options, Referrer-Policy, nosniff e CSP report-only`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Adicionar headers() no next.config.ts

Modifique `nextConfig` para:

```ts
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",            // anti-flash inline em layout.tsx
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
        ],
      },
    ]
  },
}
```

**Verify**: `npm run build` → exit 0.

### Step 2: Smoke local

`npm run dev` em background; depois:
- `curl -sI http://localhost:3000/login` → os 5 headers presentes;
- abra o app no browser (se disponível) ou rode os e2e que não exigem sessão: verifique no console que NÃO há erros funcionais (violações de CSP Report-Only aparecem como warnings — anote quais, são o insumo do operador).

**Verify**: headers presentes no curl; nenhuma feature quebrada (Report-Only não bloqueia nada — quebra funcional aqui indicaria outra causa).

### Step 3: Registrar as violações observadas

Liste no PR/relatório toda violação de CSP reportada no console em: login, dashboard (bater ponto), histórico, configurações (trocar accent custom — exercita o script inline e o `/api/icon`), instalação PWA. Essa lista é o que o operador usa para decidir a promoção a enforce.

**Verify**: lista escrita (vazia ou não) no relatório final.

## Test plan

Sem teste unitário (headers são config). Verificação = Step 2 (curl) + Step 3 (varredura manual de violações) + suíte existente `npm test` inalterada. A validação final é o deploy preview da Netlify (operador), em janela anônima.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `curl -sI http://localhost:3000/login` mostra X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy e Content-Security-Policy-Report-Only
- [ ] `npm run build` e `npm test` saem 0
- [ ] O header de CSP é **Report-Only** (grep `"Content-Security-Policy"` sem `-Report-Only` em next.config.ts → vazio)
- [ ] `git status` limpo fora do in-scope
- [ ] Linha do plano 009 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- Qualquer funcionalidade quebrar com os headers não-CSP (X-Frame-Options etc.) — em particular se alguma superfície legítima do app embutir o site em iframe.
- O `@netlify/plugin-nextjs` não propagar o `headers()` no preview (verificável só pelo operador) — registre para decidir mover ao `netlify.toml`.
- Sentir necessidade de afrouxar a CSP além do listado (ex.: `unsafe-eval`) — não afrouxe; anote a violação e reporte.

## Maintenance notes

- **Promoção a enforce**: após ≥1 semana de preview/produção sem violações legítimas, trocar `Content-Security-Policy-Report-Only` por `Content-Security-Policy`. Fica explicitamente como decisão do operador.
- **Follow-up natural**: mover o script anti-flash para nonce/hash e remover `'unsafe-inline'` de `script-src` — só vale junto com o plano 007 (paridade) para não mexer no script duas vezes.
- Toda integração nova (analytics, imagens externas) precisa entrar na CSP — o erro aparecerá primeiro como violação Report-Only.
