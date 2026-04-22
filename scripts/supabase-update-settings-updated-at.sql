-- ============================================================
-- Cursor_App: Ensure & backfill updated_at for System Settings
-- Tables: users, leave_types, holidays, timesheet_projects, expense_types
-- Safe to run multiple times (idempotent)
-- ============================================================

BEGIN;

-- 1) Shared trigger function for auto-updating updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Ensure updated_at column exists
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE timesheet_projects
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE expense_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- 3) Backfill updated_at if any row is NULL
-- Prefer created_at when available; otherwise use NOW()
UPDATE users
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

UPDATE leave_types
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

UPDATE holidays
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

UPDATE timesheet_projects
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

UPDATE expense_types
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- 4) Ensure update triggers exist
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_types_updated_at ON leave_types;
CREATE TRIGGER update_leave_types_updated_at
  BEFORE UPDATE ON leave_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_holidays_updated_at ON holidays;
CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_timesheet_projects_updated_at ON timesheet_projects;
CREATE TRIGGER update_timesheet_projects_updated_at
  BEFORE UPDATE ON timesheet_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expense_types_updated_at ON expense_types;
CREATE TRIGGER update_expense_types_updated_at
  BEFORE UPDATE ON expense_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ------------------------------------------------------------
-- Optional: If you want to stamp "all existing rows" as updated now,
-- run this block separately (uncomment):
--
-- UPDATE users SET updated_at = NOW();
-- UPDATE leave_types SET updated_at = NOW();
-- UPDATE holidays SET updated_at = NOW();
-- UPDATE timesheet_projects SET updated_at = NOW();
-- UPDATE expense_types SET updated_at = NOW();
-- ------------------------------------------------------------
