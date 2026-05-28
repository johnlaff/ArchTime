-- Reduce per-row RLS overhead by letting Postgres evaluate auth.uid() once per
-- statement, and scope policies to authenticated requests explicitly.

DROP POLICY IF EXISTS "users_select_own" ON "users";
DROP POLICY IF EXISTS "users_insert_own" ON "users";
DROP POLICY IF EXISTS "users_update_own" ON "users";
CREATE POLICY "users_select_own" ON "users"
  FOR SELECT TO authenticated
  USING ("id" = (select auth.uid())::text);
CREATE POLICY "users_insert_own" ON "users"
  FOR INSERT TO authenticated
  WITH CHECK ("id" = (select auth.uid())::text);
CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE TO authenticated
  USING ("id" = (select auth.uid())::text)
  WITH CHECK ("id" = (select auth.uid())::text);

DROP POLICY IF EXISTS "projects_select_own" ON "projects";
DROP POLICY IF EXISTS "projects_insert_own" ON "projects";
DROP POLICY IF EXISTS "projects_update_own" ON "projects";
DROP POLICY IF EXISTS "projects_delete_own" ON "projects";
CREATE POLICY "projects_select_own" ON "projects"
  FOR SELECT TO authenticated
  USING ("user_id" = (select auth.uid())::text);
CREATE POLICY "projects_insert_own" ON "projects"
  FOR INSERT TO authenticated
  WITH CHECK ("user_id" = (select auth.uid())::text);
CREATE POLICY "projects_update_own" ON "projects"
  FOR UPDATE TO authenticated
  USING ("user_id" = (select auth.uid())::text)
  WITH CHECK ("user_id" = (select auth.uid())::text);

DROP POLICY IF EXISTS "clock_entries_select_own" ON "clock_entries";
DROP POLICY IF EXISTS "clock_entries_insert_own" ON "clock_entries";
DROP POLICY IF EXISTS "clock_entries_update_own" ON "clock_entries";
DROP POLICY IF EXISTS "clock_entries_delete_own" ON "clock_entries";
CREATE POLICY "clock_entries_select_own" ON "clock_entries"
  FOR SELECT TO authenticated
  USING ("user_id" = (select auth.uid())::text AND "deleted_at" IS NULL);
CREATE POLICY "clock_entries_insert_own" ON "clock_entries"
  FOR INSERT TO authenticated
  WITH CHECK ("user_id" = (select auth.uid())::text);
CREATE POLICY "clock_entries_update_own" ON "clock_entries"
  FOR UPDATE TO authenticated
  USING ("user_id" = (select auth.uid())::text)
  WITH CHECK ("user_id" = (select auth.uid())::text);

DROP POLICY IF EXISTS "time_allocations_select_own" ON "time_allocations";
DROP POLICY IF EXISTS "time_allocations_insert_own" ON "time_allocations";
DROP POLICY IF EXISTS "time_allocations_update_own" ON "time_allocations";
DROP POLICY IF EXISTS "time_allocations_delete_own" ON "time_allocations";
CREATE POLICY "time_allocations_select_own" ON "time_allocations"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = (select auth.uid())::text
        AND ce."deleted_at" IS NULL
    )
  );
CREATE POLICY "time_allocations_insert_own" ON "time_allocations"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = (select auth.uid())::text
    )
    AND EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p."id" = "time_allocations"."project_id"
        AND p."user_id" = (select auth.uid())::text
    )
  );
CREATE POLICY "time_allocations_update_own" ON "time_allocations"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = (select auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "clock_entries" ce
      WHERE ce."id" = "time_allocations"."clock_entry_id"
        AND ce."user_id" = (select auth.uid())::text
    )
    AND EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p."id" = "time_allocations"."project_id"
        AND p."user_id" = (select auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "hour_bank_select_own" ON "hour_bank";
DROP POLICY IF EXISTS "hour_bank_insert_own" ON "hour_bank";
DROP POLICY IF EXISTS "hour_bank_update_own" ON "hour_bank";
DROP POLICY IF EXISTS "hour_bank_delete_own" ON "hour_bank";
CREATE POLICY "hour_bank_select_own" ON "hour_bank"
  FOR SELECT TO authenticated
  USING ("user_id" = (select auth.uid())::text);
CREATE POLICY "hour_bank_insert_own" ON "hour_bank"
  FOR INSERT TO authenticated
  WITH CHECK ("user_id" = (select auth.uid())::text);
CREATE POLICY "hour_bank_update_own" ON "hour_bank"
  FOR UPDATE TO authenticated
  USING ("user_id" = (select auth.uid())::text)
  WITH CHECK ("user_id" = (select auth.uid())::text);

DROP POLICY IF EXISTS "audit_log_select_own" ON "audit_log";
CREATE POLICY "audit_log_select_own" ON "audit_log"
  FOR SELECT TO authenticated
  USING ("user_id" = (select auth.uid())::text);

DROP POLICY IF EXISTS "user_settings_select_own" ON "user_settings";
DROP POLICY IF EXISTS "user_settings_insert_own" ON "user_settings";
DROP POLICY IF EXISTS "user_settings_update_own" ON "user_settings";
CREATE POLICY "user_settings_select_own" ON "user_settings"
  FOR SELECT TO authenticated
  USING ("user_id" = (select auth.uid())::text);
CREATE POLICY "user_settings_insert_own" ON "user_settings"
  FOR INSERT TO authenticated
  WITH CHECK ("user_id" = (select auth.uid())::text);
CREATE POLICY "user_settings_update_own" ON "user_settings"
  FOR UPDATE TO authenticated
  USING ("user_id" = (select auth.uid())::text)
  WITH CHECK ("user_id" = (select auth.uid())::text);
