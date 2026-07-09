# Plan 017: Remover código morto e duplicado (sweep de hygiene)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- src/lib/hour-bank.ts src/lib/dates.ts src/app/api/projects/route.ts src/app/api/projects/[id]/route.ts src/lib/__tests__/hour-bank.test.ts src/lib/__tests__/dates.test.ts prisma/schema.prisma`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

Cinco pequenos itens de código morto/duplicado que confundem leitores e custam
manutenção sem benefício: um `revalidateTag` no-op (invalida cache inexistente), um
export usado só em testes, uma função duplicada byte-idêltica, duas funções mortas em
módulo central de datas, e uma coluna de auditoria declarada mas nunca populada.
Nenhum é bug ativo, mas cada um é um sinal falso ("este cache existe? esta função é o
ponto de entrada? IP está sendo registrado?"). Este sweep remove os quatro primeiros e
decide o quinto (coluna `ipAddress`) — todos LOW risk, sem mudança de comportamento
observável.

## Current state

### #8 — `revalidateTag('projects-...')` é no-op
- `src/app/api/projects/route.ts:78` e `:143` — chamam
  `revalidateTag(\`projects-${user.id}\`, { expire: 0 })` após POST e PUT.
- `src/app/api/projects/[id]/route.ts:56` e `:78` — mesmo no DELETE e PUT.
- `rg "cacheTag" src/ | rg -i project` → **zero**. Nenhuma função `'use cache'` usa a tag
  `projects-${userId}`. As tags reais são `sidebar-${userId}` (`src/lib/server/sidebar-data.ts:26,63`,
  `src/lib/server/activity-data.ts:38,101`) e `history-${userId}` (`src/app/historico/page.tsx:14`).
  A invalidação real de projetos é client-side via `query.refetch()` nos handlers.
- Custo: 4 chamadas inúteis; sinal falso de cache server-side de projetos.

### #9 — `buildPeriodBalance` (async, exportado) só usado em testes
- `src/lib/hour-bank.ts:112` — `export async function buildPeriodBalance(...)`.
- `rg "buildPeriodBalance\b" src/ | rg -v "FromEntries"` → só `src/lib/__tests__/hour-bank.test.ts:13,43,70,80`.
- Produção usa `buildPeriodBalanceFromEntries` (sync) direto: `src/lib/summary.ts:71,77`,
  dentro do próprio `hour-bank.ts:130`, e em `history.ts` indireto. A versão async só
  adiciona um wrapper que busca settings/entries — paths que os chamadores reais já
  fazem inline.

### #10 — `shiftMonth` é cópia byte-idêntica de `addMonthsToMonthKey`
- `src/lib/hour-bank.ts:133-136` — função privada `shiftMonth(month, offset)`.
- `src/lib/dates.ts:190-193` — `export function addMonthsToMonthKey(month, delta)`.
  Corpo idêntico. O comentário em `dates.ts:200` diz "Fonte ÚNICA do offset — usada pelo
  cliente e pelo server (não duplicar)", mas `hour-bank.ts` tem sua própria cópia usada em
  `getCumulativeRange` (`:154,157,160`).

### #11 — `getWorkingDays` e `getLocalDate` (alias) só em testes
- `src/lib/dates.ts:63-73` — `export function getWorkingDays(...)`. Usado só em
  `src/lib/__tests__/dates.test.ts:5,35`. Produção calcula minutos previstos via
  `calculateExpectedMinutes` (`:113`), que usa `workMinutesByWeekday`.
- `src/lib/dates.ts:31-33` — `export function getLocalDate(date)` é alias de 1 linha para
  `getLocalDateBRT`. Usado só em `__tests__/dates.test.ts:4,26`. Produção usa
  `getLocalDateBRT` direto.

### #12 — `AuditLog.ipAddress` nunca populado
- `prisma/schema.prisma:133` — `ipAddress String? @map("ip_address")`.
- `rg "ipAddress" src/` → **zero**. Todos os `auditLog.create` setam só `userAgent`.
- Decisão: este plano **dropa a coluna** (default recomendado — nunca usada, schema
  drift vs runtime). Se o mantenedor preferir popular (capturar IP em `proxy.ts`/handlers),
  ver STOP condition do Step 5.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/app/api/projects/route.ts` — remover 2 `revalidateTag('projects-...')`
- `src/app/api/projects/[id]/route.ts` — remover 2 `revalidateTag('projects-...')`
- `src/lib/hour-bank.ts` — remover `buildPeriodBalance` e `getWorkMinutesByWeekday` (só usado por ela); remover `shiftMonth`, usar `addMonthsToMonthKey`
- `src/lib/dates.ts` — remover `getWorkingDays` e `getLocalDate`
- `src/lib/__tests__/hour-bank.test.ts` — remover testes de `buildPeriodBalance`, migrar cobertura para `buildPeriodBalanceFromEntries`
- `src/lib/__tests__/dates.test.ts` — remover testes de `getWorkingDays`, trocar `getLocalDate` por `getLocalDateBRT`
- `prisma/schema.prisma` — remover `ipAddress` do modelo `AuditLog`
- `prisma/migrations/0008_drop_audit_log_ip/migration.sql` (create) — drop da coluna

**Out of scope** (do NOT touch):
- `src/lib/offline-queue.ts`, hooks, componentes — nada disso usa os símbolos removidos.
- As tags `sidebar-${userId}`/`history-${userId}` — estas são reais e devem permanecer.
- Outras colunas de `AuditLog` — só `ipAddress` sai.

## Git workflow

- Branch: `advisor/017-dead-code-sweep`
- Commit style: `chore: remove código morto e duplicado (buildPeriodBalance, shiftMonth, getWorkingDays, revalidateTag projects no-op, ipAddress)`
- A migration 0008 (drop da coluna) NÃO deve ser aplicada em produção pelo executor — ver STOP conditions.

## Steps

### Step 1: Remover os 4 `revalidateTag('projects-...')`

Em `src/app/api/projects/route.ts`, remova as linhas `:78` e `:143`
(`revalidateTag(\`projects-${user.id}\`, { expire: 0 })`). Se o `import { revalidateTag }`
ficar sem uso após a remoção, remova o import também.

Repita em `src/app/api/projects/[id]/route.ts` (`:56` e `:78`). Verifique se o import de
`revalidateTag` ainda é usado (sim — as tags `sidebar-${user.id}`/`history-${user.id}`
permanecem em `:151-152` do PUT e equivalentes no DELETE); mantenha o import.

**Verify**: `rg -n "revalidateTag.*projects-" src/` → zero matches. `npx tsc --noEmit` → exit 0.

### Step 2: Remover `buildPeriodBalance` e `getWorkMinutesByWeekday`

Em `src/lib/hour-bank.ts`:
- Remova `getWorkMinutesByWeekday` (`:43-57`) — grep confirma que só `buildPeriodBalance` a chama.
- Remova `buildPeriodBalance` (`:112-131`).
- Confirme que `buildPeriodBalanceFromEntries` (`:74`) permanece — é o que produção usa.

Em `src/lib/__tests__/hour-bank.test.ts`:
- Remova o `import { buildHourBankMonth, buildPeriodBalance }` e troque por
  `import { buildHourBankMonth, buildPeriodBalanceFromEntries }`.
- Remova o `describe('buildPeriodBalance', ...)` (`:43-89`). Migre a cobertura
  (os 2 casos: "sums more than 10 sessions" e "filters soft-deleted entries") para um
  novo `describe('buildPeriodBalanceFromEntries')` que chame a função sync direto com
  `entries` e `workMinutesByWeekday` (sem o wrapper async). Os casos de `buildHourBankMonth`
  (`:91-140`) permanecem intocados.

**Verify**: `rg -n "buildPeriodBalance\b" src/ | rg -v "FromEntries"` → zero (exceto
comentários). `npm test -- hour-bank` → all pass.

### Step 3: Remover `shiftMonth`, usar `addMonthsToMonthKey`

Em `src/lib/hour-bank.ts`:
- Adicione `addMonthsToMonthKey` ao import de `@/lib/dates` (linha `:2-11`).
- Remova a função privada `shiftMonth` (`:133-136`).
- Troque as 3 ocorrências em `getCumulativeRange` (`:154` `shiftMonth(month, -2)`,
  `:157` `shiftMonth(month, -5)`, `:160` `shiftMonth(month, -11)`) por
  `addMonthsToMonthKey(month, -2)` / `-5` / `-11`.

**Verify**: `rg -n "shiftMonth" src/` → zero. `npx tsc --noEmit` → exit 0.
`npm test -- hour-bank` → all pass (os testes de cumulative window em `:108-140`
exercitam `getCumulativeRange` e confirmam o comportamento).

### Step 4: Remover `getWorkingDays` e `getLocalDate`

Em `src/lib/dates.ts`:
- Remova `getWorkingDays` (`:63-73`). Confirme que o import de `eachDayOfInterval`,
  `startOfMonth`, `endOfMonth` de `date-fns` (`:4-6`) — se não usados por mais nada no
  arquivo, remova-os; senão mantenha. (Verifique com `rg "eachDayOfInterval\|startOfMonth\|endOfMonth" src/lib/dates.ts` após a remoção.)
- Remova `getLocalDate` (`:31-33`).

Em `src/lib/__tests__/dates.test.ts`:
- Remova os testes de `getWorkingDays`. Troque referências a `getLocalDate` por
  `getLocalDateBRT`. Atualize o import.

**Verify**: `rg -n "getWorkingDays" src/` → zero. `rg -n "getLocalDate\b" src/ | rg -v "getLocalDateBRT"` → zero (exceto onde `getLocalDateBRT` aparece, que é o correto).
`npm test -- dates` → all pass.

### Step 5: Dropar `AuditLog.ipAddress` (com STOP condition)

**STOP — leia antes de executar:** se o mantenedor pretende popular `ipAddress`
(capturar IP em `src/proxy.ts`/handlers e passar para `auditLog.create`), **não faça
este step** — reporte a decisão do mantenedor e pule. O default recomendado é dropar
(never used, schema drift). Se o mantenedor confirmou drop, prossiga.

Em `prisma/schema.prisma`, remova a linha `:133` (`ipAddress String? @map("ip_address")`).

Crie `prisma/migrations/0008_drop_audit_log_ip/migration.sql`:

```sql
-- Dropa a coluna audit_log.ip_address — declarada no schema desde o baseline mas
-- nunca populada (todos os auditLog.create setam só userAgent). Reduz schema drift
-- vs runtime. Reverte-se com uma migration ADD COLUMN se captura de IP for desejada.

ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "ip_address";
```

**Verify**: `npx prisma generate && npx tsc --noEmit` → exit 0 (o client gerado não terá
mais `ipAddress` no tipo `AuditLog`; confirme que nada referencia `ipAddress` — `rg
"ipAddress" src/` já retornava zero). `npm test && npm run build` → exit 0.

### Step 6: Suite completa

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- Sem novos testes — este é um sweep de remoção. O gate é: testes existentes continuam
  verdes após a remoção (confirmam que nada referenciava os símbolos removidos).
- A migração de cobertura de `buildPeriodBalance` para `buildPeriodBalanceFromEntries`
  (Step 2) preserva a cobertura dos 2 casos ("10+ sessões no mesmo dia", "filtra
  soft-deleted na boundary").

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `rg -n "revalidateTag.*projects-" src/` → zero matches
- [ ] `rg -n "buildPeriodBalance\b" src/ | rg -v "FromEntries"` → zero (exceto comentários)
- [ ] `rg -n "shiftMonth" src/` → zero
- [ ] `rg -n "getWorkingDays" src/` → zero
- [ ] `rg -n "getLocalDate\b" src/ | rg -v "getLocalDateBRT"` → zero
- [ ] `rg -n "ipAddress" prisma/schema.prisma src/` → zero
- [ ] `prisma/migrations/0008_drop_audit_log_ip/migration.sql` existe
- [ ] Nenhum arquivo fora da lista de escopo foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Qualquer símbolo removido (`buildPeriodBalance`, `shiftMonth`, `getWorkingDays`,
  `getLocalDate`, `revalidateTag('projects-...')`) tem um uso em produção que os excertos
  não mostraram — `tsc --noEmit` falhará; reporte o caller antes de reverter.
- O mantenedor decide **popular** `ipAddress` em vez de dropar (Step 5) — pare e reporte;
  popular exige captura de IP em `proxy.ts`/handlers, decisão de privacidade (`x-forwarded-for`
  trust) e ADR, fora deste sweep.
- A migration 0008 não deve ser aplicada em produção pelo executor (regra dura de
  `AGENTS.md`); o executor cria o arquivo, o operador aplica.
- `rg "eachDayOfInterval\|startOfMonth\|endOfMonth" src/lib/dates.ts` (após remover
  `getWorkingDays`) ainda retorna matches de outros usos — mantenha os imports; se não,
  remova apenas os imports não usados (não remova usos legítimos).

## Maintenance notes

- Após o Step 1, a invalidação de cache de projetos é 100% client-side (`refetch()`).
  Se no futuro houver uma função `'use cache'` de projetos server-side, adicione
  `cacheTag('projects-${userId}')` a ela E restaure os `revalidateTag` — não restaure os
  `revalidateTag` sem a `cacheTag` correspondente (volta a ser no-op).
- O drop de `ipAddress` é reversível: uma migration `ADD COLUMN` recria a coluna se a
  captura de IP for desejada depois.
- Um reviewer do PR deve confirmar que cada remoção não quebrou imports (o `tsc` é o gate,
  mas vale conferir o `git diff` dos imports).
