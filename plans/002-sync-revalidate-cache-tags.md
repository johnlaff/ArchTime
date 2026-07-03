# Plan 002: Invalidar os cache tags do dashboard após o flush da fila offline em /api/sync

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/app/api/sync/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

Todas as rotas de mutação de ponto (`POST /api/clock`, `PUT/PATCH/DELETE /api/clock/[id]`) invalidam os cache tags `sidebar-${userId}` e `history-${userId}` após escrever — esses tags servem o heatmap, as barras semanais e os totais mensais de projetos (funções `'use cache'` em `src/lib/server/activity-data.ts` e `src/lib/server/sidebar-data.ts`, com `cacheLife` de revalidate 60s / expire 3600s). A única exceção é `POST /api/sync`, que executa **as mesmas mutações** (criar ClockEntry, fechar com clockOut/totalMinutes) quando a fila offline é sincronizada, mas nunca chama `revalidateTag`. Resultado: após reconectar e sincronizar, o dashboard continua servindo insight pré-sync por até 60s (pior caso 1h), visivelmente inconsistente com a mesma ação feita online.

## Current state

- `src/app/api/sync/route.ts` — rota inteira (229 linhas) **não importa nem chama `revalidateTag`** (confirme: `grep -n revalidateTag src/app/api/sync/route.ts` → vazio). Estrutura do handler `POST`:
  - branch `clock_in` (linhas 49–151): retornos idempotentes/erro cedo; sucesso cai para o `return` final.
  - branch `clock_out` (linhas 153–226): retorno idempotente na linha 168 (`if (clockEntry.clockOut) return ...`); sucesso passa por `recalculateHourBankForInterval` (linha 225) e cai para o `return` final.
  - linha 228: `return NextResponse.json({ ok: true })` — **só é alcançada quando uma mutação de fato aconteceu** (todos os caminhos sem-mutação retornam antes).
- O padrão a espelhar, em `src/app/api/clock/route.ts:92-93`:

```ts
revalidateTag(`sidebar-${user.id}`, { expire: 0 })
revalidateTag(`history-${user.id}`, { expire: 0 })
```

  (mesmo par em `src/app/api/clock/[id]/route.ts:151-152`, `203-204` e `368-369`; import na linha 2: `import { revalidateTag } from 'next/cache'`).
- Teste existente da rota: `src/app/api/sync/route.test.ts` — mocka `@/lib/prisma`, `@/lib/server/auth`, `@/lib/server/security`, `@/lib/hour-bank` e `@/lib/hash` via `vi.mock` (linhas 4–34). **Não mocka `next/cache` hoje** — será preciso adicionar, senão o import novo quebra os testes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Testes da rota | `npm test -- src/app/api/sync` | exit 0, todos passam |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Suíte completa | `npm test` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/app/api/sync/route.ts`
- `src/app/api/sync/route.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/app/api/clock/**` — já corretos; são o padrão de referência, não alvo.
- `src/lib/server/activity-data.ts` / `sidebar-data.ts` — a definição dos tags não muda.
- Qualquer mudança no guard do `recalculateHourBankForInterval` — isso é o plano 005.

## Git workflow

- Branch: `advisor/002-sync-revalidate-cache-tags`
- Commit: `fix(sync): invalida cache tags do dashboard após flush offline`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Adicionar a invalidação na rota

Em `src/app/api/sync/route.ts`:
1. Adicione `import { revalidateTag } from 'next/cache'` junto aos imports do topo.
2. Imediatamente antes do `return NextResponse.json({ ok: true })` final (linha 228 hoje), insira:

```ts
revalidateTag(`sidebar-${user.id}`, { expire: 0 })
revalidateTag(`history-${user.id}`, { expire: 0 })
```

Não adicione as chamadas dentro dos branches — o return final já é alcançado exatamente (e somente) nos dois caminhos de mutação bem-sucedida; os retornos idempotentes/erro saem antes e continuam sem invalidar (correto: nada mudou no banco).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Atualizar os testes

Em `src/app/api/sync/route.test.ts`:
1. Adicione o mock junto aos demais `vi.mock` do topo:

```ts
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
```

2. Importe `revalidateTag` de `'next/cache'` e crie `const revalidateTagMock = revalidateTag as unknown as Mock` no padrão dos mocks existentes (linhas 40–43).
3. Novos casos:
   - **clock_out com sucesso invalida os dois tags**: monte os mocks como no teste de clock_out existente e afirme `expect(revalidateTagMock).toHaveBeenCalledWith('sidebar-user-1', { expire: 0 })` e `...('history-user-1', { expire: 0 })`.
   - **caminho idempotente não invalida**: no teste existente "treats an existing offline entry id ... as idempotent" (linha 59), acrescente `expect(revalidateTagMock).not.toHaveBeenCalled()`.

**Verify**: `npm test -- src/app/api/sync` → todos passam, incluindo os 2 casos novos.

## Test plan

- `src/app/api/sync/route.test.ts`: (a) sucesso de clock_out → 2 chamadas de `revalidateTag` com os tags/opções exatos; (b) retorno idempotente → zero chamadas. Modelar nos testes existentes do mesmo arquivo.
- Verificação final: `npm test` → suíte inteira verde.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c revalidateTag src/app/api/sync/route.ts` retorna ≥ 3 (1 import + 2 chamadas)
- [ ] `npm test` sai 0, incluindo os novos casos
- [ ] `npx tsc --noEmit` sai 0
- [ ] `git status` limpo fora do in-scope
- [ ] Linha do plano 002 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- O `return NextResponse.json({ ok: true })` final não existir mais ou o fluxo de retornos da rota tiver mudado (drift) — reavalie onde a invalidação é alcançada só em caso de mutação.
- Os testes existentes de sync falharem APÓS adicionar apenas o mock de `next/cache` — algo além do esperado depende do módulo real.

## Maintenance notes

- Se um novo tipo de entrada offline for adicionado a `/api/sync` (hoje só `clock_in`/`clock_out`), o novo branch precisa continuar caindo no return final (ou invalidar explicitamente).
- Reviewer: confira que a invalidação NÃO acontece nos caminhos idempotentes — invalidar cache sem mutação é inofensivo mas mascara a semântica.
