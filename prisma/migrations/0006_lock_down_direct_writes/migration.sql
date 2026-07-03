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
