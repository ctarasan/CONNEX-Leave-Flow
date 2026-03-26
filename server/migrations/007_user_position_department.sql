-- Add dedicated employee position field without dropping existing data.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS position VARCHAR(255);

-- Backfill position from existing department value for current records.
UPDATE users
SET position = department
WHERE (position IS NULL OR TRIM(position) = '')
  AND department IS NOT NULL;
