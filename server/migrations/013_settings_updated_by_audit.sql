-- ===================================
-- Add updated_by audit for settings data
-- ===================================

-- users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(10) NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_updated_by ON users(updated_by);

-- leave_types
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(10) NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leave_types_updated_by ON leave_types(updated_by);

-- holidays
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(10) NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_holidays_updated_by ON holidays(updated_by);

-- timesheet_projects
ALTER TABLE timesheet_projects
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(10) NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_timesheet_projects_updated_by ON timesheet_projects(updated_by);

-- expense_types
ALTER TABLE expense_types
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(10) NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expense_types_updated_by ON expense_types(updated_by);
