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
