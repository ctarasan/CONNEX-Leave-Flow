-- Add resigned status/date to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_resigned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resigned_date DATE;

CREATE INDEX IF NOT EXISTS idx_users_is_resigned ON users(is_resigned);
