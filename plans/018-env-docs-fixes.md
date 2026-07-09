# Plan 018: Corrigir env var fantasma e docs de setup/segurança

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- .env.local.example README.md docs/supabase-security-checklist.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/014-sync-schema-rls-lockdown.md (recomendado — o README atualiza o passo de DB, que só é confiável pós-drift resolvido; o checklist reflete o status RLS de `user_settings`/`users`, que muda com a 0007)
- **Category**: dx | docs
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

Três itens de docs/env que prometem o que o código não cumpre:
1. `.env.local.example` declara `ADMIN_EMAIL` que nenhum código lê — sugere um sistema
   de papéis/admin que não existe. Operador pode configurá-la achando que concede poder.
2. O README de setup não tem passo de schema do DB e omite `NEXT_PUBLIC_APP_URL` —
   contribuidor seguindo o README obtém dev server que morre no primeiro request
   autenticado (sem tabelas) e mutações de preview são rejeitadas como 403 (allowlist
   de origens sem `NEXT_PUBLIC_APP_URL`).
3. `docs/supabase-security-checklist.md` omite `user_settings` da lista de tabelas RLS
   e não documenta que (após a 0007) ela e `users` seguem o mesmo regime de escrita
   das outras tabelas.

## Current state

- `.env.local.example:15-16`:
  ```
  # Admin — pode apagar projetos mesmo com registros de horas
  ADMIN_EMAIL=john@example.com
  ```
  `rg "ADMIN_EMAIL" src/` → **zero**. `src/app/api/projects/[id]/route.ts:37-62` faz
  archive-vs-delete sem bypass admin.
- `README.md:9-14` — passos: `cp .env.local.example .env.local` → `npm ci` →
  `prisma generate` → `npm run dev`. Sem `migrate deploy`/`db push`. Parêntese de env
  vars omite `NEXT_PUBLIC_APP_URL`.
- `src/lib/server/security.ts:45` — lê `process.env.NEXT_PUBLIC_APP_URL` para o allowlist
  de origens (deploy previews). Sem ela, `isSameNetlifySitePreview` (`:50`) nunca casa e
  mutações de preview URLs viram 403.
- `docs/supabase-security-checklist.md:18-20` — lista 6 tabelas RLS
  (`users, projects, clock_entries, time_allocations, hour_bank, audit_log`), omite
  `user_settings`. Não documenta o status client-writable pós-0006 (e pós-0007 do plano 014).
- `docs/supabase-security-checklist.md:8-16` — os comandos reais de setup do DB
  (`prisma migrate resolve --applied 0000_baseline` + `migrate deploy`) estão aqui.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build (valida que READMEs não quebram nada) | `npm run build` | exit 0 |

(Não há typecheck/teste de código — só docs/env.)

## Scope

**In scope** (the only files you should modify):
- `.env.local.example` — remover linhas 15-16 (`ADMIN_EMAIL`)
- `README.md` — adicionar passo de DB e `NEXT_PUBLIC_APP_URL` no parêntese de env vars
- `docs/supabase-security-checklist.md` — adicionar `user_settings` à lista RLS + nota sobre regime de escrita pós-0007

**Out of scope** (do NOT touch):
- `src/` — nenhum código lê `ADMIN_EMAIL`; nada a mudar.
- `AGENTS.md`, `CONTEXT.md` — não mencionam `ADMIN_EMAIL` nem o passo de DB.
- `docs/adr/` — não criar ADR para este sweep de docs.

## Git workflow

- Branch: `advisor/018-env-docs-fixes`
- Commit style: `docs: remove ADMIN_EMAIL fantasma, README com passo de DB e NEXT_PUBLIC_APP_URL, checklist RLS com user_settings`

## Steps

### Step 1: Remover `ADMIN_EMAIL` do `.env.local.example`

Remova as linhas 15-16 (`# Admin — pode apagar projetos mesmo com registros de horas` e
`ADMIN_EMAIL=john@example.com`). Se houver uma linha em branco residual que separava
sessões, normalize para não deixar gap duplo.

**Verify**: `rg -n "ADMIN_EMAIL" .env.local.example` → zero matches.

### Step 2: Atualizar README com passo de DB e `NEXT_PUBLIC_APP_URL`

Em `README.md`, seção "Rodando localmente" (`:9-14`), adicione um passo de schema do DB
após `prisma generate` e antes de `npm run dev`. E inclua `NEXT_PUBLIC_APP_URL` no
parêntese de env vars. Forma alvo:

```markdown
## Rodando localmente

1. `cp .env.local.example .env.local` e preencha (Supabase URL/keys, DATABASE_URL/DIRECT_URL, ALLOWED_EMAILS, NEXT_PUBLIC_APP_URL, ENTRY_HASH_SECRET)
2. `npm ci`
3. Monte o schema do DB: `npx prisma migrate deploy` (para um Supabase novo, ver `docs/supabase-security-checklist.md` para o baseline das migrations 0000–0001)
4. `npx prisma generate`
5. `npm run dev`
```

Notas:
- O passo `migrate deploy` assume que o plano 014 (drift de schema) foi aplicado — sem
  ele, `migrate deploy` deixa 4 colunas faltando. Se 014 ainda não foi aplicado, o README
  deve dizer `npx prisma db push` em vez de `migrate deploy` até o drift ser resolvido.
  Confirme o status de 014 em `plans/README.md` antes de escrever o passo exato.
- Referencie `docs/supabase-security-checklist.md` para o caso fresh-Supabase (baseline
  `migrate resolve --applied 0000_baseline`), que é mais complexo que um deploy simples.

**Verify**: leia `README.md` e confirme que os 5 passos estão em ordem e o parêntese
inclui `NEXT_PUBLIC_APP_URL`.

### Step 3: Atualizar checklist de segurança com `user_settings`

Em `docs/supabase-security-checklist.md:18-20`, adicione `user_settings` à lista de
tabelas onde `rls_disabled_in_public` não deve aparecer (agora são 7 tabelas). E adicione
uma nota sobre o regime de escrita. Forma alvo (adapte ao redoror atual):

```markdown
O esperado é não aparecer mais: `rls_disabled_in_public` para `users`, `projects`,
`clock_entries`, `time_allocations`, `hour_bank`, `audit_log`, `user_settings`.

Diferente das leituras (SELECT policies ativas em todas as tabelas — decisão de
arquitetura, AGENTS.md), TODA escrita vai pelas API routes (Prisma, role `postgres`,
bypassa RLS). As policies INSERT/UPDATE client-direct foram removidas em 0006
(clock_entries, projects, time_allocations, hour_bank) e 0007 (users, user_settings).
DELETE permanece bloqueado por ausência de policy em users/user_settings/audit_log.
```

Ajuste a referência à 0007 conforme o status real (se 014 ainda não foi aplicada em
produção, deixe a nota como "0006 cobriu 4 tabelas; users/user_settings pendem da
0007"). Confirme o status de 014 em `plans/README.md`.

**Verify**: `rg -n "user_settings" docs/supabase-security-checklist.md` → retorna matches
na lista de tabelas e na nota de regime.

### Step 4: Build sanity check

**Verify**: `npm run build` → exit 0 (confirma que nada no `.env.local.example` ou docs
afeta o build — o build lê `NEXT_PUBLIC_APP_URL` do env do CI, não do `.env.local.example`).

## Test plan

- Sem testes automatizados — é puramente de docs/env. O gate: `npm run build` verde
  (não quebra nada) + leitura humana dos 3 arquivos confirmada nos Done criteria.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n "ADMIN_EMAIL" .env.local.example` → zero matches
- [ ] `README.md` contém um passo `migrate deploy` (ou `db push` se 014 pendente) antes de `npm run dev`
- [ ] `README.md` menciona `NEXT_PUBLIC_APP_URL` no parêntese de env vars
- [ ] `rg -n "user_settings" docs/supabase-security-checklist.md` → retorna matches
- [ ] `npm run build` exits 0
- [ ] Nenhum arquivo fora da lista de escopo foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- O mantenedor pretende **implementar** o bypass admin de `ADMIN_EMAIL` (forçar
  hard-delete de projeto com horas) — então não remova a env var; reporte e abra plano
  separado para a feature.
- O plano 014 (drift de schema) ainda não foi aplicado em produção — o passo de DB do
  README deve ser `db push` temporariamente (não `migrate deploy`); confirme o status
  real em `plans/README.md` antes de decidir qual comando escrever.
- O checklist de segurança tem estrutura substancialmente diferente da descrita (ex:
  a lista de tabelas não está nas linhas 18-20) — ajuste preservando o conteúdo existente.

## Maintenance notes

- Se `ADMIN_EMAIL` voltar (feature de admin bypass implementada), restaurar a entrada
  no `.env.local.example` **e** adicionar a leitura em `src/app/api/projects/[id]/route.ts`
  com `getAuthenticatedUser` + `AuditLog` explícito — nunca apenas declarar a env var.
- O passo de DB do README deve ser revisado quando o drift de schema (plano 014) for
  resolvido: `db push` → `migrate deploy`.
- Um reviewer do PR deve confirmar que o comando de DB do README corresponde ao estado
  real das migrations (consulte `plans/README.md` e `prisma/migrations/`).
