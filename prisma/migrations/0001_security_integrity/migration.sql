-- Security, integrity and performance fixes.

ALTER TABLE "clock_entries"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deleted_by" TEXT;

CREATE INDEX IF NOT EXISTS "projects_user_id_idx" ON "projects"("user_id");
CREATE INDEX IF NOT EXISTS "projects_user_id_is_active_name_idx" ON "projects"("user_id", "is_active", "name");
CREATE INDEX IF NOT EXISTS "time_allocations_clock_entry_id_idx" ON "time_allocations"("clock_entry_id");
CREATE INDEX IF NOT EXISTS "time_allocations_project_id_idx" ON "time_allocations"("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "clock_entries_one_open_per_user_idx"
  ON "clock_entries"("user_id")
  WHERE "clock_out" IS NULL AND "deleted_at" IS NULL;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clock_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "time_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hour_bank" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON "users";
DROP POLICY IF EXISTS "users_insert_own" ON "users";
DROP POLICY IF EXISTS "users_update_own" ON "users";
CREATE POLICY "users_select_own" ON "users"
  FOR SELECT USING ("id" = auth.uid()::text);
CREATE POLICY "users_insert_own" ON "users"
  FOR INSERT WITH CHECK ("id" = auth.uid()::text);
CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE USING ("id" = auth.uid()::text)
  WITH CHECK ("id" = auth.uid()::text);

DROP POLICY IF EXISTS "projects_select_own" ON "projects";
DROP POLICY IF EXISTS "projects_insert_own" ON "projects";
DROP POLICY IF EXISTS "projects_update_own" ON "projects";
DROP POLICY IF EXISTS "projects_delete_own" ON "projects";
CREATE POLICY "projects_select_own" ON "projects"
  FOR SELECT USING ("user_id" = auth.uid()::text);
CREATE POLICY "projects_insert_own" ON "projects"
  FOR INSERT WITH CHECK ("user_id" = auth.uid()::text);
CREATE POLICY "projects_update_own" ON "projects"
  FOR UPDATE USING ("user_id" = auth.uid()::text)
  WITH CHECK ("user_id" = auth.uid()::text);
CREATE POLICY "projects_delete_own" ON "projects"
  FOR DELETE USING ("user_id" = auth.uid()::text);

DROP POLICY IF EXISTS "clock_entries_select_own" ON "clock_entries";
DROP POLICY IF EXISTS "clock_entries_insert_own" ON "clock_entries";
DROP POLICY IF EXISTS "clock_entries_update_own" ON "clock_entries";
DROP POLICY IF EXISTS "clock_entries_delete_own" ON "clock_entries";
CREATE POLICY "clock_entries_select_own" ON "clock_entries"
  FOR SELECT USING ("user_id" = auth.uid()::text AND "deleted_at" IS NULL);
CREATE POLICY "clock_entries_insert_own" ON "clock_entries"
  FOR INSERT WITH CHECK ("user_id" = auth.uid()::text);
CREATE POLICY "clock_entries_update_own" ON "clock_entries"
  FOR UPDATE USING ("user_id" = auth.uid()::text)
  WITH CHECK ("user_id" = auth.uid()::text);
CREATE POLICY "clock_entries_delete_own" ON "clock_entries"
  FOR DELETE USING ("user_id" = auth.uid()::text);

DROP POLICY IF EXISTS "time_allocations_select_own" ON "time_allocations";
DROP POLICY IF EXISTS "time_allocations_insert_own" ON "time_allocations";
DROP POLICY IF EXISTS "time_allocations_update_own" ON "time_allocations";
DROP POLICY IF EXISTS "time_allocations_delete_own" ON "time_allocations";
CREATE POLICY "time_allocations_select_own" ON "time_allocations"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = auth.uid()::text
        AND ce."deleted_at" IS NULL
    )
  );
CREATE POLICY "time_allocations_insert_own" ON "time_allocations"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p."id" = "time_allocations"."project_id"
        AND p."user_id" = auth.uid()::text
    )
  );
CREATE POLICY "time_allocations_update_own" ON "time_allocations"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p."id" = "time_allocations"."project_id"
        AND p."user_id" = auth.uid()::text
    )
  );
CREATE POLICY "time_allocations_delete_own" ON "time_allocations"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "hour_bank_select_own" ON "hour_bank";
DROP POLICY IF EXISTS "hour_bank_insert_own" ON "hour_bank";
DROP POLICY IF EXISTS "hour_bank_update_own" ON "hour_bank";
DROP POLICY IF EXISTS "hour_bank_delete_own" ON "hour_bank";
CREATE POLICY "hour_bank_select_own" ON "hour_bank"
  FOR SELECT USING ("user_id" = auth.uid()::text);
CREATE POLICY "hour_bank_insert_own" ON "hour_bank"
  FOR INSERT WITH CHECK ("user_id" = auth.uid()::text);
CREATE POLICY "hour_bank_update_own" ON "hour_bank"
  FOR UPDATE USING ("user_id" = auth.uid()::text)
  WITH CHECK ("user_id" = auth.uid()::text);
CREATE POLICY "hour_bank_delete_own" ON "hour_bank"
  FOR DELETE USING ("user_id" = auth.uid()::text);

DROP POLICY IF EXISTS "audit_log_select_own" ON "audit_log";
CREATE POLICY "audit_log_select_own" ON "audit_log"
  FOR SELECT USING ("user_id" = auth.uid()::text);
