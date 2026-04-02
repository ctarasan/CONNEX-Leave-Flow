-- Recalculate vacation_quota "as of today" (Asia/Bangkok)
-- based on payroll-cutoff accrual rules (cutoff day = 25).
--
-- Safe to run in Supabase SQL Editor.
-- This script updates users.vacation_quota only.
--
-- Rules implemented:
-- 1) anniversary_date = join_date + 1 year
-- 2) anniversary_date > Dec 31 (current year) -> entitlement = 0
-- 3) anniversary_date < Jan 1 (current year) -> entitlement = 12
-- 4) anniversary month rule:
--    - anniv day <= 25: month gets 1.0 (if start day <= 15) else 0.5
--    - anniv day > 25: anniversary month gets 0.0
-- 5) months after anniversary month accrue 1.0
-- 6) cap <= 12
-- 7) "as of today": include only months that passed payroll cutoff
--    - if today day <= 25 -> include up to previous month
--    - if today day > 25  -> include current month

BEGIN;

WITH ctx AS (
  SELECT
    (now() AT TIME ZONE 'Asia/Bangkok')::date AS today_bkk,
    EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int AS curr_year
),
base AS (
  SELECT
    u.id,
    u.join_date::date AS start_date,
    (u.join_date::date + INTERVAL '1 year')::date AS anniversary_date,
    make_date(c.curr_year, 1, 1) AS year_start,
    make_date(c.curr_year, 12, 31) AS year_end,
    c.today_bkk,
    CASE
      WHEN EXTRACT(DAY FROM c.today_bkk)::int > 25 THEN EXTRACT(MONTH FROM c.today_bkk)::int
      ELSE EXTRACT(MONTH FROM c.today_bkk)::int - 1
    END AS closed_month
  FROM users u
  CROSS JOIN ctx c
  WHERE u.join_date IS NOT NULL
),
calc AS (
  SELECT
    b.id,
    CASE
      WHEN b.anniversary_date > b.year_end THEN 0.00
      WHEN b.anniversary_date < b.year_start THEN 12.00
      ELSE LEAST(
        12.00,
        (
          CASE
            WHEN EXTRACT(MONTH FROM b.anniversary_date)::int <= GREATEST(0, b.closed_month)
             AND EXTRACT(DAY FROM b.anniversary_date)::int <= 25
            THEN CASE WHEN EXTRACT(DAY FROM b.start_date)::int <= 15 THEN 1.00 ELSE 0.50 END
            ELSE 0.00
          END
          +
          GREATEST(
            0,
            GREATEST(0, b.closed_month) - EXTRACT(MONTH FROM b.anniversary_date)::int
          )::numeric
        )
      )
    END::numeric(10,2) AS earned_entitlement_today,
    CASE
      WHEN b.anniversary_date > b.year_end THEN 0.00
      WHEN b.anniversary_date < b.year_start THEN 12.00
      ELSE LEAST(
        12.00,
        (
          CASE
            WHEN EXTRACT(DAY FROM b.anniversary_date)::int <= 25
            THEN CASE WHEN EXTRACT(DAY FROM b.start_date)::int <= 15 THEN 1.00 ELSE 0.50 END
            ELSE 0.00
          END
          +
          GREATEST(0, 12 - EXTRACT(MONTH FROM b.anniversary_date)::int)::numeric
        )
      )
    END::numeric(10,2) AS full_year_entitlement
  FROM base b
),
updated AS (
  UPDATE users u
  SET vacation_quota = c.earned_entitlement_today
  FROM calc c
  WHERE u.id = c.id
  RETURNING
    u.id,
    u.name,
    u.join_date,
    c.full_year_entitlement,
    c.earned_entitlement_today,
    u.vacation_quota AS updated_vacation_quota
)
SELECT
  id,
  name,
  join_date,
  full_year_entitlement,
  earned_entitlement_today,
  updated_vacation_quota
FROM updated
ORDER BY id;

COMMIT;
