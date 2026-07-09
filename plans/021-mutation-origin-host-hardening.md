# Plan 021: Endurecer `validateMutationOrigin` contra spoofing do header `Host`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- src/lib/server/security.ts src/lib/server/__tests__/security.test.ts docs/adr/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

`validateMutationOrigin` adiciona `req.nextUrl.origin` ao set de origens permitidas
incondicionalmente (`security.ts:47`). Como `req.nextUrl` é derivado do header `Host`
da request, em deploys onde o `Host` não é saneado pela infra (proxy reverso mal
configurado, self-hosting), um atacante poderia enviar `Host: evil.com` + `Origin:
https://evil.com` para passar no check de CSRF. No Netlify atual o edge controla o
`Host` (rotas por Host), então o ataque não roteia para o deployment ArchTime — risco
hoje mitigado por infra, não por código. Mas é defesa-em-profundura frágil e acoplada
ao deployment: se o app mudar de plataforma, ou se um path interno do Next herdar Host
não-saneado, o CSRF enfraquece sem aviso.

Este plano documenta a dependência de infra num ADR E adiciona um guard de que
`req.nextUrl.origin` só é confiável quando casa com `NEXT_PUBLIC_APP_URL` ou é um
preview/devel local — nunca sozinho.

## Current state

- `src/lib/server/security.ts:37-56` — `validateMutationOrigin`:
  ```ts
  export function validateMutationOrigin(req: NextRequest): NextResponse | null {
    const originHeader = req.headers.get('origin')
    const origin = normalizeOrigin(originHeader)
    const refererHeader = req.headers.get('referer') ?? req.headers.get('referrer') ?? req.referrer
    const referer = origin ? null : normalizeOrigin(refererHeader)
    const requestOrigin = origin ?? referer

    const allowed = new Set<string>()
    const appOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
    if (appOrigin) allowed.add(appOrigin)
    allowed.add(req.nextUrl.origin)   // ← linha 47: incondicional, derivado do Host

    if (requestOrigin && allowed.has(requestOrigin)) return null
    if (requestOrigin && isSameNetlifySitePreview(requestOrigin, appOrigin)) return null
    if (requestOrigin && process.env.NODE_ENV !== 'production' && isLocalOrigin(requestOrigin)) return null
    if (!requestOrigin && process.env.NODE_ENV !== 'production') return null

    return NextResponse.json({ error: 'Origin não permitido' }, { status: 403 })
  }
  ```
- A linha 47 (`allowed.add(req.nextUrl.origin)`) é o ponto. `req.nextUrl` deriva do
  header `Host` — o Next.js o parse de `request.url` que, em runtime serverless, é
  construído do `Host`.
- `isSameNetlifySitePreview` (`:22-35`) — cobre previews cross-origin do Netlify
  (`deploy-preview-NN--appHost.netlify.app`).
- `docs/adr/` tem 3 ADRs (0001 clock-toggle, 0002 charting, 0003 activitytype). Nenhum
  cobre segurança/CSRF.
- `src/lib/server/__tests__/security.test.ts` — testes existentes do `validateMutationOrigin`.
- `AGENTS.md:9` — feedback de review sobre RLS/policies é "hipótese, não verdade"
  (mesma postura se aplica a ADRs de segurança).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test -- security` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/server/security.ts` — condicionar a confiança em `req.nextUrl.origin`
- `src/lib/server/__tests__/security.test.ts` — adicionar caso de spoofing de `Host`
- `docs/adr/0004-mutation-origin-trust-model.md` (create) — documentar o modelo de confiança

**Out of scope** (do NOT touch):
- As 9 rotas state-changing — chamam `validateMutationOrigin` sem mudança de contrato; o
  endurecimento é interno à função.
- `src/proxy.ts` — não afeta o middleware de auth (que não faz CSRF check).
- `next.config.ts` (CSP) — separado (plano 009 histórico).

## Git workflow

- Branch: `advisor/021-mutation-origin-host-hardening`
- Commit style: `security(origin): condiciona confiança em req.nextUrl.origin e documenta modelo no ADR 0004`

## Steps

### Step 1: Decidir o modelo de confiança (com o mantenedor)

Antes de editar, confirme a decisão. Este plano assume a abordagem mais conservadora:
**`req.nextUrl.origin` só é adicionado ao set permitido quando ele casa com
`NEXT_PUBLIC_APP_URL` ou é um origin local (dev).** Em produção, se `req.nextUrl.origin`
diverge de `NEXT_PUBLIC_APP_URL`, ele **não** é confiável sozinho — o request precisa
apresentar `Origin`/`Referer` que case com `NEXT_PUBLIC_APP_URL` ou com um preview
reconhecido.

Implicação: previews do Netlify sem `NEXT_PUBLIC_APP_URL` setado (caso raro) dependeriam
do `isSameNetlifySitePreview` para validar o `Origin` do request — não mais de
`req.nextUrl.origin` sozinho. Confirme que `isSameNetlifySitePreview` cobre o caso real
dos previews (ele já casa `deploy-preview-NN--appHost`).

**Se o mantenedor preferir manter `req.nextUrl.origin` incondicional** (confiando que o
Netlify sempre saneia o Host), então este plano vira só documentação (ADR 0004) sem
mudança de código — faça só o Step 3 e pule 2 e 4. Reporte a decisão.

**Verify**: decisão registrada (na mensagem do commit ou no ADR).

### Step 2: Condicionar a confiança em `req.nextUrl.origin`

Em `src/lib/server/security.ts`, substitua a linha `:47`:

```ts
allowed.add(req.nextUrl.origin)
```

por uma lógica que só confia em `req.nextUrl.origin` se ele for igual a
`NEXT_PUBLIC_APP_URL` ou for um origin local (dev):

```ts
const nextUrlOrigin = normalizeOrigin(req.nextUrl.origin)
if (nextUrlOrigin) {
  if (appOrigin && nextUrlOrigin === appOrigin) {
    allowed.add(nextUrlOrigin)
  } else if (process.env.NODE_ENV !== 'production' && isLocalOrigin(nextUrlOrigin)) {
    allowed.add(nextUrlOrigin)
  }
  // Em produção, se nextUrlOrigin diverge de appOrigin, NÃO confie sozinho —
  // o request precisa apresentar Origin/Referer válido (appOrigin ou preview).
}
```

Notas:
- `appOrigin` já está computado em `:45`. Reuse a variável.
- `isLocalOrigin` já existe (`:13-20`). Reuse.
- O efeito em produção: um request sem `Origin`/`Referer` cujo `Host` difere de
  `NEXT_PUBLIC_APP_URL` agora é rejeitado (403) — antes passava. Em produção no Netlify,
  o `Host` casa com `NEXT_PUBLIC_APP_URL` nos deploys estáveis, então o comportamento
  não muda para tráfego legítimo. Para previews, o `Origin` do request é o URL do
  preview, que casa com `isSameNetlifySitePreview` — passa.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Escrever o ADR 0004

Crie `docs/adr/0004-mutation-origin-trust-model.md` documentando:

- **Contexto**: o `validateMutationOrigin` é o guard de CSRF para as 9 rotas
  state-changing. Ele confia em `NEXT_PUBLIC_APP_URL`, em previews do Netlify
  reconhecidos, e (historicamente) em `req.nextUrl.origin` incondicionalmente.
- **Decisão**: `req.nextUrl.origin` é derivado do header `Host`, que é saneado pela
  infra do Netlify mas não é garantido em outras plataformas. A confiança foi
  condicionada: só vale quando casa com `NEXT_PUBLIC_APP_URL` ou é um origin local (dev).
  Em produção, a infra **deve** saneiar o `Host` (Netlify o faz no edge). Mudar de
  plataforma exige revalidar esta premissa.
- **Consequências**: previews sem `NEXT_PUBLIC_APP_URL` dependem de
  `isSameNetlifySitePreview` para validar o `Origin` do request. Um request sem
  `Origin`/`Referer` de um `Host` desconhecido é rejeitado em produção (antes passava).
- **Trade-off**: perde-se a conveniência do `req.nextUrl.origin` como fallback
  automático; ganha-se defesa-em-profundura portável.

Use o formato dos ADRs existentes (`docs/adr/0001-clock-toggle-via-event-bus.md` como
modelo — contexto, decisão, consequências).

**Verify**: `ls docs/adr/0004-mutation-origin-trust-model.md` → existe.

### Step 4: Adicionar teste de spoofing de Host

Em `src/lib/server/__tests__/security.test.ts`, adicione um caso que simula o ataque:
um `NextRequest` cujo `Host` é `evil.com` (fazendo `req.nextUrl.origin` =
`https://evil.com`) com `Origin: https://evil.com`, em `NODE_ENV=production`, sem
`NEXT_PUBLIC_APP_URL` setado (ou setado a `https://archtime.netlify.app`).
Verifique: `validateMutationOrigin` retorna **403** (não null), porque
`req.nextUrl.origin` não casa com `appOrigin` e `Origin` não casa com nada permitido.

Modelar nos testes existentes do arquivo (que já mockam `NextRequest` e env).

**Verify**: `npm test -- security` → all pass, incluindo o novo caso.

### Step 5: Suite completa + build

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- `src/lib/server/__tests__/security.test.ts`: novo caso "rejeita request cujo
  `Host` spoofado não casa com `NEXT_PUBLIC_APP_URL` em produção" — simula `Host:
  evil.com` + `Origin: https://evil.com`, espera 403.
- Caso de regressão: "aceita request same-origin legítimo em produção" — `Host` casa
  com `NEXT_PUBLIC_APP_URL`, `Origin` igual, espera `null` (permitido). Confirma que o
  endurecimento não quebra tráfego legítimo.
- Caso: "aceita preview do Netlify reconhecido" — `Origin` é
  `deploy-preview-5--archtime.netlify.app`, `NEXT_PUBLIC_APP_URL` é
  `https://archtime.netlify.app`, espera `null` (via `isSameNetlifySitePreview`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; novo caso de spoofing existe e passa
- [ ] `npm run build` exits 0
- [ ] `docs/adr/0004-mutation-origin-trust-model.md` existe
- [ ] `rg -n "allowed.add\(req.nextUrl.origin\)" src/lib/server/security.ts` → zero
      (a confiança incondicional foi removida)
- [ ] Nenhum arquivo fora da lista de escopo foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- O endurecimento quebra um caso legítimo de preview/deploy que os testes existentes
  não cobrem — reporte o caso antes de ajustar (pode indicar que `isSameNetlifySitePreview`
  não cobre um padrão de URL real do Netlify).
- O mantenedor decide **não** condicionar a confiança (confiar no Netlify para sempre
  sanejar o Host) — faça só o ADR (Step 3) e pule 2 e 4; reporte a decisão.
- `req.nextUrl.origin` em runtime serverless do Next 16 não deriva do `Host` como
  assumido (verifique a documentação do Next se o comportamento mudou) — se o Next já
  saneia, o risco é menor mas a documentação (ADR) ainda vale.

## Maintenance notes

- Se o app for movido do Netlify para outra plataforma (Vercel, self-host, container),
  **revalidar** a premissa "infra saneia o Host" — pode ser necessário um proxy/middleware
  explícito que sobrescreve `Host` antes de chegar ao Next.
- O `NEXT_PUBLIC_APP_URL` precisa estar setado por ambiente (incluindo previews). O
  Netlify expõe `DEPLOY_PRIME_URL` ou similar; se previews usam URLs dinâmicas, considere
  setar `NEXT_PUBLIC_APP_URL` dinamicamente no `netlify.toml` ou validar que
  `isSameNetlifySitePreview` cobre todos os padrões de preview.
- Um reviewer do PR deve confirmar: (a) tráfego legítimo (same-origin, previews)
  continua passando; (b) o ataque de spoofing é rejeitado; (c) o ADR documenta a
  premissa de infra que o código assume.
