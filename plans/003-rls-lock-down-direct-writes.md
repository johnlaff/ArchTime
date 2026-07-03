# Plan 003: Travar INSERT/UPDATE client-direct no RLS — toda escrita passa a ser exclusiva das API routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- prisma/migrations/ src/lib/supabase/ src/lib/client-data.ts AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-ci-github-actions.md (recomendado, não bloqueante)
- **Category**: security
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

`AGENTS.md` declara o invariante arquitetural: *"Todas as escritas devem passar por API Routes. Não escreva direto no banco a partir de Client Components."* As API routes (Prisma, role `postgres` — não sujeita a RLS) impõem AuditLog, hash HMAC de integridade (`ENTRY_HASH_SECRET`), validação de payload e recálculo do `hour_bank`. Porém as políticas RLS atuais **ainda permitem INSERT e UPDATE `TO authenticated`** em `clock_entries`, `projects`, `time_allocations` e `hour_bank`. Qualquer sessão autenticada no browser (o anon key + JWT já estão carregados no client para leituras) pode escrever direto no Supabase — sem auditoria, sem hash, sem validação — inclusive no `hour_bank`, que `AGENTS.md` define como cache derivado calculado no servidor. A migration `0002_lock_down_direct_deletes` já fez exatamente esse lockdown para DELETE; este plano completa o trabalho para INSERT/UPDATE. Verifiquei que **nenhum código cliente usa `.insert()/.update()/.upsert()` do Supabase** (só leituras), então nada legítimo quebra.

## Current state

- `prisma/migrations/0005_rls_policy_initplan/migration.sql` — última migration de políticas; recria, entre outras (linhas 25–31, 40–46, 62–75, 105–108):

```sql
CREATE POLICY "clock_entries_insert_own" ON "clock_entries"
  FOR INSERT TO authenticated
  WITH CHECK ("user_id" = (select auth.uid())::text);
CREATE POLICY "clock_entries_update_own" ON "clock_entries"
  FOR UPDATE TO authenticated
  USING ("user_id" = (select auth.uid())::text)
  WITH CHECK ("user_id" = (select auth.uid())::text);
```

  (padrão análogo para `projects`, `time_allocations` e `hour_bank`.)
- `prisma/migrations/0002_lock_down_direct_deletes/migration.sql` — o precedente a espelhar (arquivo completo):

```sql
-- Block direct client-side hard deletes through Supabase/PostgREST.
-- Deletion workflows must go through the backend so soft-delete and audit rules run.

DROP POLICY IF EXISTS "projects_delete_own" ON "projects";
DROP POLICY IF EXISTS "clock_entries_delete_own" ON "clock_entries";
DROP POLICY IF EXISTS "time_allocations_delete_own" ON "time_allocations";
DROP POLICY IF EXISTS "hour_bank_delete_own" ON "hour_bank";
```

- Escritas do app usam Prisma com `DATABASE_URL` (pooler, role postgres — bypassa RLS): nenhuma API route é afetada por dropar políticas.
- Leituras client-direct (deliberadas, ver `AGENTS.md`) usam só SELECT: `grep -rn "\.insert(\|\.upsert(\|\.update(\|\.delete(" src/ --include="*.ts" --include="*.tsx"` retorna **apenas** `src/lib/hash.ts:25` (HMAC `.update()`, não é Supabase). Rode você mesmo para confirmar.
- A linha `users` também tem `users_insert_own`/`users_update_own`; o upsert de usuário acontece server-side (`src/app/auth/callback/route.ts:67`, via Prisma) — mas **users fica fora do escopo** deste plano (follow-up deliberado, ver Maintenance notes).
- **Contexto crítico de infraestrutura** (de `docs/adr/0003` e `AGENTS.md`): o banco é ÚNICO — produção, previews e dev apontam para o mesmo Supabase. `prisma.config.ts` carrega `.env.local` e usa `DIRECT_URL` para CLI/migrations. Aplicar a migration é uma operação em produção.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Testes | `npm test` | exit 0 |
| Status das migrations | `npx prisma migrate status` | lista migrations; a nova aparece como pendente antes do deploy |
| Aplicar (SÓ o operador autoriza) | `npx prisma migrate deploy` | "1 migration applied" |

## Scope

**In scope** (the only files you should modify):
- `prisma/migrations/0006_lock_down_direct_writes/migration.sql` (criar)

**Out of scope** (do NOT touch, even though they look related):
- Políticas de SELECT — as leituras client-direct com RLS são deliberadas (`AGENTS.md`), removê-las quebra o app.
- Políticas da tabela `users` — follow-up separado (decisão de produto sobre onboarding client-side).
- `prisma/schema.prisma`, qualquer migration existente (histórico é imutável).
- Qualquer código TypeScript.

## Git workflow

- Branch: `advisor/003-rls-lock-down-direct-writes`
- Commit: `security(rls): trava INSERT/UPDATE client-direct nas tabelas de escrita via API`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Confirmar que nenhum código cliente escreve via Supabase

Rode: `grep -rn "\.insert(\|\.upsert(\|\.update(\|\.delete(" src/ --include="*.ts" --include="*.tsx" | grep -v "prisma\|tx\.\|db\.put\|db\.delete\|createHmac"`

**Verify**: saída vazia (ou apenas `src/lib/hash.ts` se o filtro do grep variar). Se aparecer QUALQUER escrita Supabase client-side, é STOP condition.

### Step 2: Criar a migration

Crie `prisma/migrations/0006_lock_down_direct_writes/migration.sql`:

```sql
-- Block direct client-side INSERT/UPDATE through Supabase/PostgREST.
-- Every write must go through the API routes (Prisma), where AuditLog,
-- the ENTRY_HASH_SECRET integrity hash, payload validation and the
-- hour_bank recalculation are enforced. Mirrors 0002_lock_down_direct_deletes.
-- Client-direct reads (SELECT policies) remain untouched — they are a
-- deliberate architecture decision (see AGENTS.md).

DROP POLICY IF EXISTS "clock_entries_insert_own" ON "clock_entries";
DROP POLICY IF EXISTS "clock_entries_update_own" ON "clock_entries";
DROP POLICY IF EXISTS "projects_insert_own" ON "projects";
DROP POLICY IF EXISTS "projects_update_own" ON "projects";
DROP POLICY IF EXISTS "time_allocations_insert_own" ON "time_allocations";
DROP POLICY IF EXISTS "time_allocations_update_own" ON "time_allocations";
DROP POLICY IF EXISTS "hour_bank_insert_own" ON "hour_bank";
DROP POLICY IF EXISTS "hour_bank_update_own" ON "hour_bank";
```

**Verify**: `ls prisma/migrations/0006_lock_down_direct_writes/migration.sql` → existe; conteúdo bate com o bloco acima.

### Step 3: PARAR e entregar ao operador para aplicação

**Não aplique a migration você mesmo.** O banco é o de produção (compartilhado com previews). Reporte ao operador que a migration está pronta e que a aplicação é:

```
npx prisma migrate status   # confirmar que 0006 está pendente
npx prisma migrate deploy   # aplica contra DIRECT_URL (produção)
```

### Step 4 (operador, pós-aplicação): verificar as políticas restantes

No SQL editor do Supabase (ou via MCP `execute_sql`), rode:

```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('clock_entries','projects','time_allocations','hour_bank')
ORDER BY tablename, cmd;
```

**Verify**: só restam políticas `SELECT` (`*_select_own`) nessas 4 tabelas — nenhuma linha com cmd INSERT/UPDATE/DELETE.

### Step 5 (operador, pós-aplicação): smoke test do app

Bater ponto (entrada e saída) pela UI, abrir Histórico e Projetos.

**Verify**: tudo funciona — as escritas passam pelo Prisma (não-RLS) e as leituras client-direct continuam com as políticas SELECT.

## Test plan

Não há teste unitário para políticas SQL neste repo. A verificação é o Step 4 (consulta `pg_policies`) + Step 5 (smoke manual). Os 173+ testes existentes (`npm test`) continuam passando pois nada de TypeScript muda.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `prisma/migrations/0006_lock_down_direct_writes/migration.sql` existe com os 8 DROPs
- [ ] Step 1 (grep de escritas client-side) confirmado vazio
- [ ] `npm test` sai 0 (nada de código mudou)
- [ ] Migration aplicada pelo OPERADOR e Step 4 confirma só SELECT nas 4 tabelas
- [ ] Linha do plano 003 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- O Step 1 encontrar qualquer `.insert(/.update(/.upsert(` do Supabase em código cliente — o lockdown quebraria essa escrita; o achado muda.
- `pg_policies` no banco real divergir do que as migrations descrevem (alguém alterou políticas fora do histórico de migrations — `AGENTS.md` manda tratar isso com cautela).
- Qualquer instrução pedir para você aplicar a migration sem confirmação explícita do operador — a aplicação é em produção.

## Maintenance notes

- **Follow-up deliberadamente adiado**: políticas `users_insert_own`/`users_update_own` — o upsert de user é server-side hoje, mas dropar exige confirmar que nenhum fluxo futuro de onboarding client-side é planejado.
- Toda tabela nova no schema deve nascer com políticas só-SELECT para `authenticated` (escritas via API) — vale registrar como ADR se o padrão se repetir.
- Reviewer: confira que NENHUMA política `*_select_own` foi tocada.
