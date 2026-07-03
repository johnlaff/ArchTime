# Plan 008: Fechar o ciclo do hash de integridade — verificar o que hoje só se grava

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/lib/hash.ts src/app/api/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/003-rls-lock-down-direct-writes.md (recomendado: sem o lockdown, escrita client-direct pode "atualizar" linhas sem recalcular hash — a verificação pegaria isso, mas o cenário limpo é pós-003)
- **Category**: security
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

Todo clock-out e toda edição gravam um HMAC-SHA256 (`ENTRY_HASH_SECRET`) sobre `clockIn/clockOut/userId/entryDate` — mas **nenhum call site jamais recomputa e compara** o hash armazenado (`grep -rn "generateEntryHash" src/` mostra só geração). O mecanismo de tamper-evidence hoje é decoração: uma linha de `clock_entries` alterada por fora dos handlers (SQL manual, um bug, ou — antes do plano 003 — escrita client-direct) passaria despercebida para sempre. Este plano adiciona o lado de leitura: um helper de verificação + uma rota de checagem de integridade autenticada que reporta divergências.

## Current state

- `src/lib/hash.ts` (27 linhas, arquivo completo relevante):

```ts
const HASH_PREFIX = 'hmac-v1:'

export async function generateEntryHash(entry: {
  clockIn: string
  clockOut: string
  userId: string
  entryDate: string
}): Promise<string> {
  const secret =
    process.env.ENTRY_HASH_SECRET ??
    (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-entry-hash-secret')
  if (!secret) throw new Error('ENTRY_HASH_SECRET is required to generate entry hashes')
  const data = JSON.stringify({ clockIn: ..., clockOut: ..., userId: ..., entryDate: ... })
  return `${HASH_PREFIX}${createHmac('sha256', secret).update(data).digest('hex')}`
}
```

- Sites de gravação (não mudam): `src/app/api/clock/[id]/route.ts:110` (PUT) e `:308` (PATCH), `src/app/api/sync/route.ts:175`.
- Formato dos campos no hash: `clockIn`/`clockOut` como `toISOString()`, `entryDate` como `entry.entryDate.toISOString().slice(0, 10)` — a verificação DEVE reproduzir exatamente isso.
- Entradas legadas: `ClockEntry.hash` é `String?` — entradas antigas/abertas têm `hash: null`; entradas em aberto (sem clockOut) nunca têm hash. A verificação só se aplica a entradas **fechadas com hash não-nulo**; `hash: null` em entrada fechada é reportado como `unhashed`, não como mismatch.
- Convenção de rota autenticada: ver `src/app/api/hour-bank/route.ts` ou `src/app/api/history/route.ts` (GET com `getAuthenticatedUser`, 401 sem user).
- Padrão de teste de rota: `src/app/api/settings/route.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Testes novos | `npm test -- integrity hash` | exit 0 |
| Suíte completa | `npm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/hash.ts` (adicionar `verifyEntryHash`)
- `src/app/api/integrity/route.ts` (criar)
- `src/lib/__tests__/hash.test.ts` (criar)
- `src/app/api/integrity/route.test.ts` (criar)

**Out of scope** (do NOT touch, even though they look related):
- Os 3 sites de GRAVAÇÃO do hash — formato não muda (mudaria o significado de todos os hashes existentes).
- UI (badge de integridade no Histórico) — deliberadamente adiado; a rota primeiro.
- `src/proxy.ts` — `/api/integrity` deve ficar ATRÁS do auth (o matcher já cobre tudo que não está na lista de exceções; não adicione exceção).

## Git workflow

- Branch: `advisor/008-entry-hash-verification`
- Commit: `feat(security): rota de verificação de integridade dos hashes de ponto`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Adicionar verifyEntryHash em src/lib/hash.ts

```ts
import { createHmac, timingSafeEqual } from 'crypto'

/** Recomputa o HMAC e compara em tempo constante com o hash armazenado. */
export async function verifyEntryHash(
  entry: { clockIn: string; clockOut: string; userId: string; entryDate: string },
  storedHash: string
): Promise<boolean> {
  const expected = await generateEntryHash(entry)
  const a = Buffer.from(expected)
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Criar GET /api/integrity

`src/app/api/integrity/route.ts`: autentica (`getAuthenticatedUser`, 401 sem user); busca as entradas fechadas do usuário (`prisma.clockEntry.findMany({ where: { userId: user.id, deletedAt: null, clockOut: { not: null } }, select: { id: true, clockIn: true, clockOut: true, entryDate: true, hash: true } })`); para cada uma:
- `hash === null` → conta em `unhashed`;
- senão `verifyEntryHash({ clockIn: e.clockIn.toISOString(), clockOut: e.clockOut!.toISOString(), userId: user.id, entryDate: e.entryDate.toISOString().slice(0,10) }, e.hash)` → falso soma em `mismatches` (com `{ id, entryDate }`).

Resposta: `{ checked, unhashed, mismatches: [{ id, entryDate }] }` com `Cache-Control: private, no-store`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Testes

1. `src/lib/__tests__/hash.test.ts`: (a) round-trip — `generateEntryHash` seguido de `verifyEntryHash` → true; (b) qualquer campo alterado (clockOut +1min) → false; (c) hash com comprimento diferente → false (sem lançar). Em ambiente de teste o fallback `dev-only-entry-hash-secret` vale (NODE_ENV ≠ production) — não defina segredo real.
2. `src/app/api/integrity/route.test.ts` (padrão settings/route.test.ts; mocks de prisma e auth): (a) 401 sem user; (b) entrada com hash válido → `checked: 1, mismatches: []` — gere o hash esperado chamando o `generateEntryHash` REAL no arranjo do teste (não mocke `@/lib/hash` aqui); (c) hash adulterado → 1 mismatch com o id; (d) `hash: null` → conta em `unhashed`.

**Verify**: `npm test -- integrity hash` → todos passam.

### Step 4: Suíte completa

`npm test && npx tsc --noEmit`

**Verify**: exit 0 nos dois.

## Test plan

Ver Step 3 — 7 casos no total. Verificação final: suíte inteira verde.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n verifyEntryHash src/lib/hash.ts src/app/api/integrity/route.ts` → presente nos dois
- [ ] `npm test` e `npx tsc --noEmit` saem 0 com os novos casos
- [ ] `/api/integrity` NÃO aparece nas exceções do matcher em `src/proxy.ts` (`grep integrity src/proxy.ts` → vazio)
- [ ] `git status` limpo fora do in-scope
- [ ] Linha do plano 008 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- O formato exato dos campos no hash divergir do descrito (ex.: alguém mudou `entryDate` para outro slice) — a verificação reprovaria hashes legítimos; reporte antes de escrever qualquer comparação.
- Você se ver tentado a "consertar" hashes divergentes reescrevendo-os — NUNCA: a rota é detectiva, regravar hashes destrói a evidência.

## Maintenance notes

- **Adiado**: superfície de UI (badge no Histórico / tela de configurações) e verificação inline no read-path — decisão de produto sobre onde exibir.
- O prefixo `hmac-v1:` existe para permitir rotação de algoritmo; uma v2 exigiria verificação dupla por prefixo.
- Se `ENTRY_HASH_SECRET` for rotacionado, TODOS os hashes antigos passam a divergir — a rota reportaria tudo como mismatch. Rotação exige re-hash em lote (fora deste escopo; documente no PR).
