-- Block direct client-side hard deletes through Supabase/PostgREST.
-- Deletion workflows must go through the backend so soft-delete and audit rules run.

DROP POLICY IF EXISTS "projects_delete_own" ON "projects";
DROP POLICY IF EXISTS "clock_entries_delete_own" ON "clock_entries";
DROP POLICY IF EXISTS "time_allocations_delete_own" ON "time_allocations";
DROP POLICY IF EXISTS "hour_bank_delete_own" ON "hour_bank";
