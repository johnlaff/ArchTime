# Supabase Security Checklist

## Ordem de aplicação

1. Conferir `DATABASE_URL` e `DIRECT_URL` no ambiente local.
2. No banco Supabase existente, marcar o baseline como aplicado:

   ```bash
   npx prisma migrate resolve --applied 0000_baseline
   ```

3. Aplicar as migrations incrementais:

   ```bash
   npx prisma migrate deploy
   ```

4. Rodar o Advisor do Supabase novamente. O esperado é não aparecer mais:
   - `rls_disabled_in_public` para `users`, `projects`, `clock_entries`, `time_allocations`, `hour_bank`, `audit_log`, `user_settings`;
   - `unindexed_foreign_keys` para `projects_user_id_fkey`, `time_allocations_clock_entry_id_fkey`, `time_allocations_project_id_fkey`.

## Auth

- Se email/senha estiver habilitado, ativar leaked password protection no Supabase Auth.
- Se o produto usar somente Google OAuth, desabilitar password auth e manter o fluxo documentado como OAuth-only.

## Segredos

- Configurar o keyring de HMAC em produção conforme a ADR 0005: manter a chave legada, declarar a
  chave ativa e armazenar um segredo aleatório por `keyId`. `ENTRY_HASH_SECRET` permanece apenas
  durante a janela de rollout/rollback compatível.
- Manter `ALLOWED_EMAILS` como lista explícita de usuários permitidos.

## Regime de escrita (RLS)

Diferente das leituras (SELECT policies ativas em todas as tabelas — decisão de
arquitetura, `AGENTS.md`), **toda** escrita vai pelas API routes (Prisma, role
`postgres`, que bypassa RLS). As policies `INSERT`/`UPDATE` client-direct foram
removidas em `0006` (`clock_entries`, `projects`, `time_allocations`, `hour_bank`)
e `0007` (`users`, `user_settings`). `DELETE` permanece bloqueado por ausência de
policy em `users`/`user_settings`/`audit_log`.

## Observações

- As policies RLS protegem o acesso via Supabase/PostgREST.
- O backend Prisma continua operando pela conexão server-side configurada em `DATABASE_URL`.
- `audit_log` permite leitura própria via RLS e não cria policy de escrita direta para clients.
