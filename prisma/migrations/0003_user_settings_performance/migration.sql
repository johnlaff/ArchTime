-- User-level preferences for work schedule, hour-bank display and appearance.

CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id" TEXT NOT NULL,
  "work_minutes_by_weekday" JSONB NOT NULL DEFAULT '{"0":0,"1":480,"2":480,"3":480,"4":480,"5":480,"6":0}'::jsonb,
  "work_schedule_template" TEXT NOT NULL DEFAULT 'standard_40h',
  "show_cumulative_balance" BOOLEAN NOT NULL DEFAULT false,
  "cumulative_balance_scope" TEXT NOT NULL DEFAULT 'since_start',
  "cumulative_start_date" DATE NOT NULL,
  "accent_preset" TEXT NOT NULL DEFAULT 'indigo',
  "theme_mode" TEXT NOT NULL DEFAULT 'system',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_settings_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "user_settings" (
  "user_id",
  "work_minutes_by_weekday",
  "work_schedule_template",
  "show_cumulative_balance",
  "cumulative_balance_scope",
  "cumulative_start_date",
  "accent_preset",
  "theme_mode"
)
SELECT
  u."id",
  '{"0":0,"1":480,"2":480,"3":480,"4":480,"5":480,"6":0}'::jsonb,
  'standard_40h',
  false,
  'since_start',
  COALESCE(
    (
      SELECT date_trunc('month', timezone('America/Sao_Paulo', min(ce."clock_in")))::date
      FROM "clock_entries" ce
      WHERE ce."user_id" = u."id"
        AND ce."clock_out" IS NOT NULL
        AND ce."deleted_at" IS NULL
    ),
    date_trunc('month', timezone('America/Sao_Paulo', now()))::date
  ),
  'indigo',
  'system'
FROM "users" u
ON CONFLICT ("user_id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "clock_entries_closed_user_clock_range_idx"
  ON "clock_entries"("user_id", "clock_in", "clock_out")
  WHERE "deleted_at" IS NULL AND "clock_out" IS NOT NULL;

ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_select_own" ON "user_settings";
DROP POLICY IF EXISTS "user_settings_insert_own" ON "user_settings";
DROP POLICY IF EXISTS "user_settings_update_own" ON "user_settings";

CREATE POLICY "user_settings_select_own" ON "user_settings"
  FOR SELECT USING ("user_id" = auth.uid()::text);
CREATE POLICY "user_settings_insert_own" ON "user_settings"
  FOR INSERT WITH CHECK ("user_id" = auth.uid()::text);
CREATE POLICY "user_settings_update_own" ON "user_settings"
  FOR UPDATE USING ("user_id" = auth.uid()::text)
  WITH CHECK ("user_id" = auth.uid()::text);
