-- ===================================
-- Timesheet tables (non-destructive)
-- ===================================

CREATE TABLE IF NOT EXISTS timesheet_task_types (
  id VARCHAR(100) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timesheet_projects (
  id VARCHAR(100) PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  project_manager_id VARCHAR(10) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_user_ids TEXT[] NOT NULL DEFAULT '{}',
  task_target_days JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  project_id VARCHAR(100) NOT NULL REFERENCES timesheet_projects(id) ON DELETE CASCADE,
  task_type_id VARCHAR(100) NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0 CHECK (minutes >= 0 AND minutes <= 1440),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entry_date, project_id, task_type_id)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_projects_manager ON timesheet_projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_user_date ON timesheet_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_project ON timesheet_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_task_type ON timesheet_entries(task_type_id);

-- Reuse shared trigger function if available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_timesheet_task_types_updated_at ON timesheet_task_types;
    CREATE TRIGGER update_timesheet_task_types_updated_at
      BEFORE UPDATE ON timesheet_task_types
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_timesheet_projects_updated_at ON timesheet_projects;
    CREATE TRIGGER update_timesheet_projects_updated_at
      BEFORE UPDATE ON timesheet_projects
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_timesheet_entries_updated_at ON timesheet_entries;
    CREATE TRIGGER update_timesheet_entries_updated_at
      BEFORE UPDATE ON timesheet_entries
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

INSERT INTO timesheet_task_types (id, label, display_order, is_active)
VALUES
  ('research', 'Research', 1, TRUE),
  ('coding', 'Coding', 2, TRUE),
  ('testing', 'Testing', 3, TRUE),
  ('bug-fixing', 'Bug Fixing', 4, TRUE),
  ('planning', 'Planning', 5, TRUE)
ON CONFLICT (id) DO UPDATE
SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active;
