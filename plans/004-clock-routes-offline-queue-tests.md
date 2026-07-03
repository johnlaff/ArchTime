# Plan 004: Cobrir com testes unitários as rotas de clock e a fila offline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/app/api/clock/ src/lib/offline-queue.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (mas o plano 005 depende DESTE)
- **Category**: tests
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

As rotas que gravam horas trabalhadas — a razão de existir do app — não têm nenhum teste que rode em `npm test`: `POST /api/clock` (clock-in transacional com AuditLog) e `PUT/PATCH/DELETE /api/clock/[id]` (clock-out com hash HMAC, edição auditada, soft-delete; 383 linhas) só são exercitadas por um e2e Playwright que exige sessão Supabase real e não roda em CI. A fila offline (`src/lib/offline-queue.ts`), que decide a ordem de flush após reconexão, também está sem cobertura — um bug de ordenação corromperia o histórico de quem trabalha com rede intermitente. O padrão de mock já existe e funciona em `src/app/api/sync/route.test.ts`; este plano o replica.

## Current state

- `src/app/api/clock/route.ts` (116 linhas) — `POST` clock-in: valida origem (`validateMutationOrigin`) e auth (`getAuthenticatedUser`); `parseActivityType` (400 se inválida); valida projeto ativo (404); `prisma.$transaction(async tx => ...)` que lança `Error('open-session')` se há sessão aberta (vira 409 com `entryId`), cria ClockEntry + TimeAllocation (se projectId) + AuditLog; trata `P2002` como 409; sucesso → `revalidateTag` ×2 + 201.
- `src/app/api/clock/[id]/route.ts` (383 linhas):
  - `PUT` (61–154): clock-out. Se `entry.clockOut` já existe → 200 idempotente com o payload da entrada (linhas 78–90). Senão valida range (`validateClosedRange`, aceita `allowLongSession`), calcula `totalMinutes` (`calcDurationMinutes`), `hash` (`generateEntryHash`), transação (update + `timeAllocation.updateMany` + AuditLog), depois `recalculateHourBankForInterval` e `revalidateTag` ×2.
  - `DELETE` (156–206): 409 se sessão em andamento; soft-delete (`deletedAt`, `deletedBy`) + AuditLog em transação; recalc; 204.
  - `PATCH` (208–383): edição. 400 se faltam horários; 409 se em andamento; recomputa `entryDate`/`totalMinutes`/`hash`; troca alocação (`deleteMany` + `create`); AuditLog com oldData/newData; recalc dos DOIS intervalos (antigo e novo) via `Promise.all`.
- **Nenhum `*.test.ts` existe em `src/app/api/clock/`** (confirme: `find src/app/api/clock -name "*test*"` → vazio).
- Padrão de teste a seguir — `src/app/api/sync/route.test.ts:4-51`:

```ts
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clockEntry: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    project: { findFirst: vi.fn() },
    timeAllocation: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/server/security', () => ({ validateMutationOrigin: vi.fn(() => null) }))
vi.mock('@/lib/hour-bank', () => ({ recalculateHourBankForInterval: vi.fn() }))
vi.mock('@/lib/hash', () => ({ generateEntryHash: vi.fn() }))
```

  Requests montadas com `new NextRequest('https://archtime-live.netlify.app/...', { method, body, headers })`. Handlers com params dinâmicos recebem `{ params: Promise.resolve({ id: 'entry-1' }) }`.
  **Atenção**: as rotas de clock também chamam `revalidateTag` — mocke `vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))`.
  **Atenção 2**: `$transaction` é usado de duas formas — com callback (`$transaction(async tx => ...)`) e com array. No mock, implemente `transactionMock.mockImplementation(async (arg) => Array.isArray(arg) ? Promise.all(arg) : arg(txMock))` onde `txMock` tem os mesmos métodos mockados.
- `src/lib/offline-queue.ts` (113 linhas) — IndexedDB via `idb`: `syncPendingEntries()` ordena por `timestamp.localeCompare` (linha 75), POSTa cada item em `/api/sync`; 4xx com `permanent !== false` → move para `FAILED_STORE` e continua; 5xx/rede → `break` mantendo a fila; sucesso → remove do store.
- Ambiente Vitest: `happy-dom` (ver `vitest.config.ts`) — **não tem IndexedDB**. Use `fake-indexeddb` (dev-dependency nova) para testar a fila de verdade; `fetch` global mockado com `vi.stubGlobal`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Instalar dep de teste | `npm i -D fake-indexeddb` | exit 0, entra em devDependencies |
| Testes novos | `npm test -- src/app/api/clock src/lib/__tests__/offline-queue` | exit 0 |
| Suíte completa | `npm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/app/api/clock/route.test.ts` (criar)
- `src/app/api/clock/[id]/route.test.ts` (criar)
- `src/lib/__tests__/offline-queue.test.ts` (criar)
- `package.json` + `package-lock.json` (somente adicionar `fake-indexeddb` em devDependencies)

**Out of scope** (do NOT touch, even though they look related):
- Qualquer arquivo de produção (`route.ts`, `offline-queue.ts`) — este plano só ADICIONA testes. Se um teste revelar bug real, é STOP condition (reporte, não conserte aqui).
- `e2e/**` — os e2e continuam como estão.

## Git workflow

- Branch: `advisor/004-clock-routes-offline-queue-tests`
- Commit: `test(clock): cobre rotas de ponto e fila offline com testes unitários`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Instalar fake-indexeddb

`npm i -D fake-indexeddb`

**Verify**: `grep fake-indexeddb package.json` → aparece em devDependencies.

### Step 2: Testes de POST /api/clock

Crie `src/app/api/clock/route.test.ts` com os mocks do "Current state" e os casos:
1. **401 sem usuário**: `getAuthenticatedUserMock.mockResolvedValue(null)` → status 401.
2. **400 atividade inválida**: mocke `@/lib/activity-types` (`parseActivityType: vi.fn()`) retornando `undefined` → 400.
3. **404 projeto inexistente/inativo**: body com `projectId`, `project.findFirst` → null → 404.
4. **409 sessão aberta**: `txMock.clockEntry.findFirst` → `{ id: 'open-1' }` (o handler lança 'open-session') → 409 com `entryId: 'open-1'`.
5. **201 caminho feliz**: transação cria entry; afirme AuditLog chamado com `action: 'clock_in'`, `revalidateTag` chamado com `sidebar-user-1` e `history-user-1`, status 201.
6. **409 em P2002**: `transactionMock.mockRejectedValue({ code: 'P2002' })` → 409.

**Verify**: `npm test -- src/app/api/clock/route.test.ts` → 6 casos passando.

### Step 3: Testes de PUT/PATCH/DELETE /api/clock/[id]

Crie `src/app/api/clock/[id]/route.test.ts` (params: `{ params: Promise.resolve({ id: 'entry-1' }) }`). Casos mínimos:
1. **PUT 404** entrada inexistente (`clockEntry.findFirst` → null).
2. **PUT idempotente**: entrada já fechada → 200 com o payload da entrada, `$transaction` NÃO chamado.
3. **PUT feliz**: entrada aberta → afirme `generateEntryHash` chamado com clockIn/clockOut/userId/entryDate; AuditLog `action: 'clock_out'`; `recalculateHourBankForInterval` chamado; `revalidateTag` ×2.
4. **PUT 400 range inválido**: `clockOutAt` anterior ao clockIn (use `validateClosedRange` REAL — não mocke `@/lib/server/validation`, os parsers puros funcionam em teste).
5. **DELETE 409** sessão em andamento (`clockOut: null`).
6. **DELETE feliz**: afirme update com `deletedAt`/`deletedBy` e AuditLog `action: 'delete_entry'`, status 204.
7. **PATCH 400** sem horários.
8. **PATCH feliz**: novos horários válidos → afirme `timeAllocation.deleteMany` + `create` quando `projectId` presente, AuditLog `action: 'edit_entry'`, recalc chamado 2×.

**Verify**: `npm test -- "src/app/api/clock/\[id\]"` → 8 casos passando.

### Step 4: Testes da fila offline

Crie `src/lib/__tests__/offline-queue.test.ts`:

```ts
import 'fake-indexeddb/auto'   // ANTES de importar offline-queue
```

Mocke `fetch` com `vi.stubGlobal('fetch', fetchMock)`. Casos:
1. **Ordenação cronológica**: adicione 3 entries com timestamps fora de ordem (`addPendingEntry`); `syncPendingEntries()`; afirme que `fetchMock` recebeu os bodies em ordem crescente de `timestamp`.
2. **Sucesso remove da fila**: respostas `{ ok: true }` → `synced: 3, remaining: 0`.
3. **4xx permanente move para failed**: uma resposta `{ ok: false, status: 400 }` com json `{ permanent: true, error: 'x' }` → entry sai da fila principal, aparece em `getFailedEntries()`, `failed: 1`, e o flush CONTINUA para as seguintes.
4. **5xx interrompe preservando a fila**: primeira resposta 500 → `break`; `remaining` = total; nada movido para failed.
5. **Erro de rede interrompe**: `fetchMock.mockRejectedValue` → mesmo comportamento do caso 4.

Entre casos, limpe os stores (delete as entries retornadas por `getPendingEntries`/reabra o DB) — `fake-indexeddb/auto` persiste por processo; use `indexedDB.deleteDatabase('archtime-offline')` em `beforeEach` e aguarde via wrapper de Promise.

**Verify**: `npm test -- offline-queue` → 5 casos passando.

### Step 5: Suíte completa

`npm test && npx tsc --noEmit`

**Verify**: exit 0 nos dois; contagem total de testes subiu em ~19.

## Test plan

É o próprio plano (Steps 2–4). Padrão estrutural: `src/app/api/sync/route.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Os 3 arquivos de teste existem e `npm test` sai 0 com ~19 casos novos
- [ ] `npx tsc --noEmit` sai 0
- [ ] Nenhum arquivo de produção modificado: `git diff --name-only | grep -v test | grep -v package` vazio (exceto package*.json pela dep)
- [ ] Linha do plano 004 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- Um teste revelar comportamento divergente do descrito (ex.: PUT idempotente chamando a transação) — isso é um bug real de produção ou drift; reporte com o caso reproduzível, NÃO conserte a rota.
- `fake-indexeddb` conflitar com happy-dom (erros de global) e você não resolver com `fake-indexeddb/auto` no topo do arquivo — reporte em vez de trocar o environment do Vitest global.

## Maintenance notes

- O plano 005 adiciona casos de regressão NESTES arquivos (recalc que falha não pode derrubar a resposta) — mantenha os mocks de `@/lib/hour-bank` acessíveis.
- Quando `POST /api/clock` ganhar novos campos, o caso 5 (feliz) é onde o AuditLog é verificado — atualize o `newData` esperado.
