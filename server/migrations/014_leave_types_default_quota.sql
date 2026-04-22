-- ===================================
-- Add default_quota to leave_types
-- ===================================

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS default_quota NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE leave_types
SET default_quota = CASE LOWER(TRIM(id))
  WHEN 'sick' THEN 30
  WHEN 'vacation' THEN 12
  WHEN 'personal' THEN 3
  WHEN 'maternity' THEN 90
  WHEN 'sterilization' THEN 999
  WHEN 'paternity' THEN 15
  WHEN 'ordination' THEN 120
  WHEN 'military' THEN 60
  WHEN 'other' THEN 0
  ELSE COALESCE(default_quota, 0)
END
WHERE default_quota IS NULL OR default_quota = 0;
