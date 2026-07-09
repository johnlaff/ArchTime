# Plan 014: Sincronizar schema Prisma com migrations e completar o lockdown de RLS client-direct

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- prisma/schema.prisma prisma/migrations/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration | security
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

Há três divergências entre `prisma/schema.prisma` e o conjunto de migrations:

1. **4 colunas + 2 índices existem no schema mas em nenhuma migration.** A ADR 0003
   documenta que `activity_type` foi aplicada via `prisma db push` direto em produção;
   `architectural_preset`, `density`, `custom_accent_color` e os índices
   `@@index([userId, clockOut, deletedAt])` / `@@index([userId, deletedAt, entryDate])`
   são drift mais recente. O Prisma client gerado de `schema.prisma` faz SELECT dessas
   colunas a cada chamada — um DB montado pelo caminho documentado
   (`docs/supabase-security-checklist.md` manda `prisma migrate deploy`) falha no primeiro
   request autenticado com "column does not exist". É outage de onboarding/staging.

2. **`user_settings` e `users` permanecem graváveis client-direct** (PostgREST). A
   migration `0006_lock_down_direct_writes` trancou INSERT/UPDATE client-direct de
   `clock_entries`, `projects`, `time_allocations`, `hour_bank` — mas omitiu
   `user_settings` e `users`, que mantêm policies `insert_own`/`update_own` ativas
   (`0005_rls_policy_initplan/migration.sql:10-16,124-129`). A motivação declarada da
   0006 ("every write must go through the API routes where AuditLog, ENTRY_HASH_SECRET,
   payload validation and hour_bank recalculation are enforced") aplica-se aqui também.
   Nenhum código de cliente escreve direto nessas tabelas (grep confirma zero), então as
   policies são inertes para o app — trancá-las é LOW risk. O impacto é auto-limitado
   (`WITH CHECK` restringe à própria linha), mas viola a intenção da 0006 e permite
   corromper `email`/`default_work_hours`/`workMinutesByWeekday` contornando
   `parseSettingsPatch`.

Uma única migration `0007` resolve os três pontos: adiciona as colunas/índices faltantes
e dropa as policies client-direct de `user_settings` e `users`.

## Current state

- `prisma/schema.prisma:76` — `activityType String? @map("activity_type") @db.VarChar(50)`
  em `ClockEntry`. Nenhuma migration cria essa coluna (confirmado: `rg activity_type
  prisma/migrations/` retorna vazio).
- `prisma/schema.prisma:38-40` — `architecturalPreset`, `density` (default `'cozy'`),
  `customAccentColor` em `UserSettings`. Nenhuma migration cria essas colunas.
- `prisma/schema.prisma:89-90` — índices `@@index([userId, clockOut, deletedAt])` e
  `@@index([userId, deletedAt, entryDate])` em `ClockEntry`. Não constam em migrations.
- `prisma/migrations/0006_lock_down_direct_writes/migration.sql` — droppou policies
  INSERT/UPDATE de 4 tabelas; **não menciona** `user_settings` nem `users`.
- `prisma/migrations/0005_rls_policy_initplan/migration.sql:10-16` — `users_insert_own`
  / `users_update_own` ativas (`WITH CHECK ("id" = (select auth.uid())::text)`), sem
  restrição de colunas. `:124-129` — `user_settings_insert_own` / `user_settings_update_own`
  ativas.
- `src/app/auth/callback/route.ts:67` — a única escrita legítima em `users` é
  `prisma.user.upsert` via Prisma (role `postgres`, bypassa RLS). Trancar a policy não a
  afeta.
- `src/lib/user-settings.ts:231` — a única escrita em `user_settings` é
  `prisma.userSettings.update` via Prisma (bypassa RLS). Trancar a policy não a afeta.
- Convenção de migration: cada diretório `prisma/migrations/NNNN_slug/migration.sql` é
  autocontido, começa com um comentário de propósito, usa `IF NOT EXISTS`/`IF EXISTS`
  para idempotência. Modelo a espelhar: `0006_lock_down_direct_writes/migration.sql`
  (15 linhas, comentário explicando o "porquê", `DROP POLICY IF EXISTS` por tabela).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Generate Prisma client | `npx prisma generate` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Migration test | `npx vitest run prisma/__tests__/migrations.test.ts` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `prisma/migrations/0007_sync_schema_and_lockdown/migration.sql` (create)
- `prisma/migrations/migration_lock.toml` (não alterar — apenas confirmar que existe)

**Out of scope** (do NOT touch):
- `prisma/schema.prisma` — o schema já declara as colunas/índices; a migration alcança o
  DB, não o schema. Não altere o schema.
- `src/lib/server/security.ts`, rotas de API, qualquer código de aplicação — esta
  migration é puramente de banco de dados.
- Policies SELECT — permanecem intocadas (leitura client-direct é decisão de
  arquitetura, ver AGENTS.md).
- Policies DELETE de `users`/`user_settings` — já não existem (RLS bloqueia DELETE por
  ausência de policy), não criar.

## Git workflow

- Branch: `advisor/014-sync-schema-rls-lockdown`
- Commit style (conventional commits, do repositório): `fix(prisma): migration 0007 sincroniza colunas/índices e trancar RLS de users/user_settings`
- Do NOT push, abrir PR ou aplicar a migration em produção. A APLICAÇÃO em produção é
  do operador (ver STOP conditions).

## Steps

### Step 1: Criar a migration 0007

Crie `prisma/migrations/0007_sync_schema_and_lockdown/migration.sql` com este conteúdo
(espelhe o estilo de `0006_lock_down_direct_writes/migration.sql` — comentário inicial
explicando o "porquê", `IF NOT EXISTS` para idempotência):

```sql
-- Sync drift: colunas e índices presentes no schema.prisma mas ausentes das migrations
-- anteriores (aplicados via db push em produção — ver ADR 0003 para activity_type).
-- E completa o lockdown da 0006 trancando INSERT/UPDATE client-direct em users e
-- user_settings, que foram omitidos. Nenhum código de cliente escreve direto nessas
-- tabelas (grep confirma zero); toda escrita legítima usa Prisma (role postgres, bypassa
-- RLS). Policies SELECT permanecem intocadas (decisão de arquitetura, AGENTS.md).

-- Drift de colunas (ClockEntry)
ALTER TABLE "clock_entries"
  ADD COLUMN IF NOT EXISTS "activity_type" VARCHAR(50);

-- Drift de colunas (UserSettings)
ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "architectural_preset" TEXT;
ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "density" TEXT NOT NULL DEFAULT 'cozy';
ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "custom_accent_color" TEXT;

-- Drift de índices (ClockEntry)
CREATE INDEX IF NOT EXISTS "clock_entries_user_id_clock_out_deleted_at_idx"
  ON "clock_entries"("user_id", "clock_out", "deleted_at");
CREATE INDEX IF NOT EXISTS "clock_entries_user_id_deleted_at_entry_date_idx"
  ON "clock_entries"("user_id", "deleted_at", "entry_date");

-- Lockdown RLS: trancar INSERT/UPDATE client-direct restantes
DROP POLICY IF EXISTS "users_insert_own" ON "users";
DROP POLICY IF EXISTS "users_update_own" ON "users";
DROP POLICY IF EXISTS "user_settings_insert_own" ON "user_settings";
DROP POLICY IF EXISTS "user_settings_update_own" ON "user_settings";
```

Nota sobre os nomes dos índices: o Prisma gera nomes automáticos para `@@index` no
formato `<table>_<colunas>_idx`. Os nomes acima seguem esse padrão. Se ao rodar
`prisma migrate diff` (opcional, ver Step 3) os nomes gerados divergirem, ajuste os
`CREATE INDEX` para bater com o que o Prisma esperaria — o importante é que as colunas
e a ordem coincidam com `schema.prisma:89-90`.

**Verify**: `ls prisma/migrations/0007_sync_schema_and_lockdown/migration.sql` → o arquivo
existe.

### Step 2: Confirmar que o schema e a migration estão alinhados

Gere o Prisma client (que usa `schema.prisma`, não a migration) e rode o typecheck para
confirmar que nenhum tipo quebrou:

**Verify**: `npx prisma generate && npx tsc --noEmit` → exit 0, sem erros.

### Step 3 (opcional, recomendado): Validar a migration contra o schema

Se houver um DB de desenvolvimento acessível (via `DATABASE_URL` em `.env.local`), rode
em modo **dry-run** para confirmar que a migration 0007 leva um DB das migrations
0000–0006 ao estado do `schema.prisma`:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "<DATABASE_URL>_shadow"
```

O diff esperado é **vazio** (ou quase — apenas diferenças de nome de índice se os nomes
não baterem). Se houver colunas/índices faltantes no diff, ajuste a migration.

Se não houver DB de desenvolvimento acessível, pule este step — a verificação dos
Steps 2 e 4 é suficiente para a correção do tipo.

**Verify**: diff vazio, ou você entende e corrigiu cada diferença residual.

### Step 4: Rodar os testes de migrations existentes

Existe um teste de migrations em `prisma/__tests__/migrations.test.ts`. Rode-o:

**Verify**: `npx vitest run prisma/__tests__/migrations.test.ts` → all pass.

Se o teste falhar porque a migration 0007 introduz uma coluna que o teste não esperava,
leia o teste — ele provavelmente valida o nome/ordem das migrations; ajuste apenas se o
teste estiver verificando algo que a 0007 viola legítimamente ( improvável). Se o teste
valida drift de schema, ele deve passar verde após a 0007.

### Step 5: Rodar a suite completa e o build

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- Não há novos testes unitários de aplicação nesta migration (é DDL pura). O gate é o
  teste de migrations existente (`prisma/__tests__/migrations.test.ts`) + typecheck +
  build.
- Validação de RLS (que `users`/`user_settings` não aceitam mais INSERT/UPDATE
  client-direct) é um teste vivo contra o Supabase, fora do escopo deste plano. Após a
  aplicação em produção, o operador pode confirmar com:
  ```sql
  SELECT polname FROM pg_policies WHERE tablename IN ('users','user_settings')
    AND cmd IN ('INSERT','UPDATE');
  ```
  Deve retornar **zero linhas** (apenas `*_select_own` permanecem).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx prisma generate` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npx vitest run prisma/__tests__/migrations.test.ts` exits 0
- [ ] `npm run build` exits 0
- [ ] `prisma/migrations/0007_sync_schema_and_lockdown/migration.sql` existe e contém
      as 4 colunas, 2 índices e 4 `DROP POLICY`
- [ ] `rg "activity_type" prisma/migrations/0007_sync_schema_and_lockdown/migration.sql`
      retorna match (a coluna drift agora tem migration)
- [ ] `prisma/schema.prisma` não foi modificado (`git diff --name-only` não o lista)
- [ ] Nenhum arquivo fora de `prisma/migrations/0007_sync_schema_and_lockdown/` foi criado/modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **NÃO aplicar a migration em produção.** A APLICAÇÃO da migration 0007 em produção é
  responsabilidade do operador (regra dura de `AGENTS.md`: não fazer escrita destrutiva
  sem confirmação explícita, e o banco é compartilhado entre previews e produção — ADR
  0003). O executor cria o arquivo da migration; o operador roda
  `npx prisma migrate resolve --applied 0007_sync_schema_and_lockdown` + aplica o SQL.
- O código nos locais citados em "Current state" não corresponde aos excertos (a
  codebase derivou desde a escrita deste plano).
- `npx prisma migrate diff` (Step 3) mostra diferenças estruturais além de nomes de
  índice — pode haver drift adicional não mapeado; reporte antes de improvisar.
- O teste `prisma/__tests__/migrations.test.ts` falha por um motivo que não seja a
  adição benigna da migration 0007.

## Maintenance notes

- Após a aplicação em produção, atualize `docs/supabase-security-checklist.md` para
  refletir que o conjunto de migrations está completo (sem `db push` extra) e que
  `users`/`user_settings` agora seguem o mesmo regime RLS das outras tabelas
  (escritas só via Prisma). Isto é coberto pelo plano 018.
- Se futuramente houver edição de perfil de usuário (rota `/api/profile`), criar a rota
  com Prisma + whitelist de campos (estilo `parseSettingsPatch` em
  `src/lib/user-settings.ts:148`), **nunca** reabilitar policies client-direct em
  `users`.
- Um reviewer do PR deve confirmar: (a) as 4 colunas são additive/nullable (sim —
  `density` é `NOT NULL DEFAULT 'cozy'` para matches o default do schema); (b) os 4
  `DROP POLICY` não têm efeito em código legítimo (grep `from('users'|'user_settings')`
  em `src/` deve retornar zero).
