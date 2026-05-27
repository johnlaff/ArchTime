-- Add week-start-day preference to user settings (Monday or Sunday).

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "week_start_day" TEXT NOT NULL DEFAULT 'monday';
