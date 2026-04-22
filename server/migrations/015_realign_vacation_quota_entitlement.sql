-- Recompute vacation_quota for all users using the same rules as the API:
-- earned = (12 - month(anniversary) + 1) - join-day adjustment
-- join day 1-15: 0 / 16-25: 0.5 / >25: 1
-- Does not modify updated_by (one-time data fix).

UPDATE users u
SET vacation_quota = e.earned_entitlement_today
FROM (
  WITH ctx AS (
    SELECT
      (now() AT TIME ZONE 'Asia/Bangkok')::date AS today_bkk,
      EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int AS curr_year
  ),
  base AS (
    SELECT
      u2.id,
      CASE
        WHEN EXTRACT(YEAR FROM u2.join_date::date)::int >= 2400
          THEN (u2.join_date::date - INTERVAL '543 years')::date
        ELSE u2.join_date::date
      END AS start_date,
      make_date(c.curr_year, 1, 1) AS year_start,
      make_date(c.curr_year, 12, 31) AS year_end,
      c.today_bkk
    FROM users u2
    CROSS JOIN ctx c
    WHERE u2.join_date IS NOT NULL
  ),
  calc AS (
    SELECT
      b.id,
      b.start_date,
      (b.start_date + INTERVAL '1 year')::date AS anniversary_date,
      b.year_start,
      b.year_end,
      b.today_bkk
    FROM base b
  ),
  ent AS (
    SELECT
      c.id,
      CASE
        WHEN c.anniversary_date > c.year_end THEN 0.00
        WHEN c.anniversary_date < c.year_start THEN 12.00
        WHEN c.today_bkk < c.anniversary_date THEN 0.00
        ELSE GREATEST(
          0.00,
          LEAST(
            12.00,
            (
              (12 - EXTRACT(MONTH FROM c.anniversary_date)::int + 1)::numeric
              -
              CASE
                WHEN EXTRACT(DAY FROM c.start_date)::int BETWEEN 1 AND 15 THEN 0.00
                WHEN EXTRACT(DAY FROM c.start_date)::int BETWEEN 16 AND 25 THEN 0.50
                ELSE 1.00
              END
            )
          )
        )
      END::numeric(10,2) AS earned_entitlement_today
    FROM calc c
  )
  SELECT id, earned_entitlement_today FROM ent
) e
WHERE u.id = e.id;
