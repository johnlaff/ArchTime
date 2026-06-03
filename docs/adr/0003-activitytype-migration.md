# ADR 0003 — Migração de `activityType`: coluna nullable aplicada direto em produção

**Data:** 2026-06-02 · **Status:** Aceito

## Contexto

Tipos de atividade exigem um campo novo em `ClockEntry`. O ambiente é Supabase free tier (DB único —
o deploy de preview da Netlify aponta para o **mesmo** banco de produção). O usuário autorizou rodar
a migração antes de abrir o PR.

## Decisão

Adicionar `activityType String? @map("activity_type") @db.VarChar(50)` a `ClockEntry` e aplicar a
coluna **direto no banco de produção** (`prisma db push` contra `DIRECT_URL`), antes do PR.

- Coluna `activity_type` em snake_case, consistente com a convenção da tabela `clock_entries`
  (`clock_in`, `entry_date`, `total_minutes`) — a spec citava `"activityType"`, divergimos por
  consistência.
- Sem backfill: sessões existentes ficam com `NULL`.

## Consequências

- **+** Aditiva, nullable e retrocompatível: o código atual (que ignora a coluna) continua válido,
  então a migração é segura mesmo antes do merge e não quebra produção.
- **+** O preview da Netlify (mesmo DB) já encontra a coluna existente — sem isso, o preview
  quebraria ao escrever `activityType`.
- **−** O schema do banco passa a estar à frente do `main` por um curto intervalo (até o merge).
  Aceito por ser aditivo. Rollback: `ALTER TABLE clock_entries DROP COLUMN activity_type`.
- Requer `prisma generate` para o client tipado refletir o campo.
