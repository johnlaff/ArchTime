-- Enforces at most 1 open session per user at the DB level.
-- Prevents race conditions independently of application logic.
-- CONCURRENTLY avoids write locks during index creation on production.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_clock_open_session
  ON clock_entries(user_id)
  WHERE clock_out IS NULL AND deleted_at IS NULL;
