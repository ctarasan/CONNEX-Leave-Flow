import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { normalizeUserId, rowToCamel } from '../util.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const defaultQuotas = () => ({ sick: 0, personal: 0, vacation: 0, ordination: 0, military: 0, maternity: 0, sterilization: 0, paternity: 0 });
const getQuotaValue = (quotas: unknown, key: string): number => {
  if (!quotas || typeof quotas !== 'object') return 0;
  const q = quotas as Record<string, unknown>;
  const raw = q[key] ?? q[key.toUpperCase()] ?? q[key.toLowerCase()];
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
};
const quotaOut = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const normIdSql = (col: string): string =>
  `(CASE
     WHEN TRIM(COALESCE((${col})::text, '')) ~ '^[0-9]+$'
       THEN LPAD(((TRIM(((${col})::text)))::int)::text, 3, '0')
     ELSE TRIM(COALESCE((${col})::text, ''))
   END)`;

/** สูตรเดียวกับ POST /recalculate-vacation-quota-current — หักตามวันเริ่มงาน (1–15: 0 / 16–25: 0.5 / >25: 1) */
const VACATION_QUOTA_RECALC_SQL = `
      WITH ctx AS (
        SELECT
          (now() AT TIME ZONE 'Asia/Bangkok')::date AS today_bkk,
          EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int AS curr_year
      ),
      base AS (
        SELECT
          u.id,
          CASE
            WHEN EXTRACT(YEAR FROM u.join_date::date)::int >= 2400
              THEN (u.join_date::date - INTERVAL '543 years')::date
            ELSE u.join_date::date
          END AS start_date,
          make_date(c.curr_year, 1, 1) AS year_start,
          make_date(c.curr_year, 12, 31) AS year_end,
          c.today_bkk
        FROM users u
        CROSS JOIN ctx c
        WHERE u.join_date IS NOT NULL
          AND ($2::text IS NULL OR u.id = $2)
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
          c.anniversary_date,
          CASE
            WHEN c.anniversary_date > c.year_end THEN 0.00
            WHEN c.anniversary_date < c.year_start THEN 12.00
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
          END::numeric(10,2) AS full_year_entitlement,
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
          END::numeric(10,2) AS earned_entitlement_today,
          c.today_bkk
        FROM calc c
      ),
      updated AS (
        UPDATE users u
        SET vacation_quota = e.earned_entitlement_today,
            updated_by = $1
        FROM ent e
        WHERE u.id = e.id
        RETURNING
          u.id,
          u.name,
          u.join_date AS "joinDate",
          e.full_year_entitlement AS "fullYearEntitlement",
          e.earned_entitlement_today AS "earnedEntitlementToday",
          u.vacation_quota AS "vacationQuota"
      )
      SELECT * FROM updated ORDER BY id
      `;

async function runVacationQuotaRecalc(updatedBy: string | null, targetUserId: string | null) {
  return pool.query(VACATION_QUOTA_RECALC_SQL, [normalizeUserId(updatedBy), targetUserId]);
}

let userProfileAuditColumnsEnsured = false;
async function ensureUserProfileAuditColumns(): Promise<void> {
  if (userProfileAuditColumnsEnsured) return;
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_updated_by TEXT`);
  await pool.query(`
    UPDATE users
    SET profile_updated_at = COALESCE(profile_updated_at, updated_at),
        profile_updated_by = COALESCE(NULLIF(TRIM(profile_updated_by), ''), NULLIF(TRIM(COALESCE(updated_by::text, '')), ''))
    WHERE profile_updated_at IS NULL
       OR profile_updated_by IS NULL
       OR TRIM(COALESCE(profile_updated_by, '')) = ''
  `);
  userProfileAuditColumnsEnsured = true;
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    try {
      await ensureUserProfileAuditColumns();
    } catch (ensureErr) {
      console.warn('[users] ensure profile audit columns failed:', ensureErr instanceof Error ? ensureErr.message : ensureErr);
    }
    const includeResignedRaw = String((_req.query?.includeResigned ?? '')).trim().toLowerCase();
    const includeResigned = includeResignedRaw === '1' || includeResignedRaw === 'true' || includeResignedRaw === 'yes';
    let rows: Record<string, unknown>[];
    try {
      const r = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.gender, u.position, u.department, u.join_date as "joinDate", u.manager_id as "managerId",
          u.sick_quota, u.personal_quota, u.vacation_quota, u.ordination_quota,
          u.military_quota, u.maternity_quota, u.sterilization_quota, u.paternity_quota,
          COALESCE(u.is_resigned, FALSE) as "isResigned",
          COALESCE(u.resigned_date::text, '') as "resignedDate",
          COALESCE(u.profile_updated_at, u.updated_at) as "updatedAt",
          COALESCE(NULLIF(TRIM(COALESCE(u.profile_updated_by::text, '')), ''), NULLIF(TRIM(COALESCE(u.updated_by::text, '')), '')) as "updatedById",
          COALESCE(editor.name, '') as "updatedByName",
          COALESCE(u.is_suspended, FALSE) as "isSuspended",
          COALESCE(u.failed_login_attempts, 0) as "failedLoginAttempts"
        FROM users u
        LEFT JOIN users editor ON ${normIdSql('editor.id')} = ${normIdSql(`COALESCE(NULLIF(TRIM(COALESCE(u.profile_updated_by::text, '')), ''), NULLIF(TRIM(COALESCE(u.updated_by::text, '')), ''))`)}
        WHERE ($1::boolean = TRUE OR COALESCE(u.is_resigned, FALSE) = FALSE)
        ORDER BY u.id`
      , [includeResigned]
      );
      rows = r.rows as Record<string, unknown>[];
    } catch (qErr) {
      const msg = qErr instanceof Error ? qErr.message : '';
      if (msg.includes('sick_quota') || msg.includes('quotas') || msg.includes('column')) {
        const r = await pool.query(
          `SELECT id, name, email, role, gender,
            CASE id
              WHEN '001' THEN 'Managing Director'
              WHEN '002' THEN 'Software Development Manager'
              WHEN '003' THEN 'Financial Director'
              WHEN '004' THEN 'Project Manager'
              WHEN '005' THEN 'Project Manager'
              WHEN '008' THEN 'แม่บ้าน'
              WHEN '011' THEN 'System Analyst'
              WHEN '012' THEN 'Business Analyst'
              WHEN '013' THEN 'Senior System Analyst'
              WHEN '017' THEN 'Senior Programmer'
              WHEN '020' THEN 'Quality Assurance'
              WHEN '021' THEN 'Brand Strategic Manager'
              WHEN '023' THEN 'Creative Designer'
              WHEN '025' THEN 'Quality Assurance'
              WHEN '026' THEN 'Programmer'
              WHEN '027' THEN 'Sale Executive'
              WHEN '028' THEN 'Programmer'
              ELSE ''
            END as position,
            department, join_date as "joinDate", manager_id as "managerId",
            FALSE as "isResigned",
            ''::text as "resignedDate",
            updated_at as "updatedAt",
            ''::text as "updatedById",
            ''::text as "updatedByName",
            COALESCE(is_suspended, FALSE) as "isSuspended",
            COALESCE(failed_login_attempts, 0) as "failedLoginAttempts"
           FROM users ORDER BY id`
        );
        rows = (r.rows as Record<string, unknown>[]).map(row => ({ ...row, quotas: {} }));
      } else {
        throw qErr;
      }
    }
    // ถ้ายังไม่ได้รัน migration 006 (คอลัมน์ security ยังไม่มี) ให้ตั้งค่า default เพื่อไม่ให้ frontend พัง
    rows = rows.map((r) => ({
      ...r,
      isResigned: (r as Record<string, unknown>).isResigned ?? false,
      resignedDate: (r as Record<string, unknown>).resignedDate ?? '',
      isSuspended: (r as Record<string, unknown>).isSuspended ?? false,
      failedLoginAttempts: (r as Record<string, unknown>).failedLoginAttempts ?? 0,
    }));
    const list = rows.map((r: Record<string, unknown>) => {
      const { sick_quota, personal_quota, vacation_quota, ordination_quota, military_quota, maternity_quota, sterilization_quota, paternity_quota, quotas: quotasJson, ...rest } = r;
      const o = rowToCamel(rest);
      const q = quotasJson && typeof quotasJson === 'object' && !Array.isArray(quotasJson)
        ? { ...defaultQuotas(), ...quotasJson as Record<string, number> }
        : {
            sick: quotaOut(sick_quota),
            personal: quotaOut(personal_quota),
            vacation: quotaOut(vacation_quota),
            ordination: quotaOut(ordination_quota),
            military: quotaOut(military_quota),
            maternity: quotaOut(maternity_quota),
            sterilization: quotaOut(sterilization_quota),
            paternity: quotaOut(paternity_quota),
          };
      return { ...o, password: '', quotas: q };
    });
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('invalid input syntax for type integer')) {
      return res.status(400).json({ error: 'ฐานข้อมูลยังไม่รองรับโควต้าแบบทศนิยม กรุณารัน migration: server/migrations/012_quota_decimal.sql' });
    }
    res.status(500).json({ error: message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    try {
      await ensureUserProfileAuditColumns();
    } catch (ensureErr) {
      console.warn('[users] ensure profile audit columns failed:', ensureErr instanceof Error ? ensureErr.message : ensureErr);
    }
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const { id, name, email, password, role = 'EMPLOYEE', gender, position = '', department = '', joinDate, managerId, quotas, isResigned, resignedDate } = req.body;
    if (!name || !email || !password || !gender || !joinDate) {
      return res.status(400).json({ error: 'ต้องมี name, email, password, gender, joinDate' });
    }
    const uid = id || `U${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Extract quotas
    const sickQuota = getQuotaValue(quotas, 'sick');
    const personalQuota = getQuotaValue(quotas, 'personal');
    const vacationQuota = getQuotaValue(quotas, 'vacation');
    const ordinationQuota = getQuotaValue(quotas, 'ordination');
    const militaryQuota = getQuotaValue(quotas, 'military');
    const maternityQuota = getQuotaValue(quotas, 'maternity');
    const sterilizationQuota = getQuotaValue(quotas, 'sterilization');
    const paternityQuota = getQuotaValue(quotas, 'paternity');
    
    const ins = await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, gender, position, department, join_date, manager_id,
        sick_quota, personal_quota, vacation_quota, ordination_quota, military_quota, maternity_quota, sterilization_quota, paternity_quota, is_resigned, resigned_date, updated_by, profile_updated_by, profile_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [uid, name, email, passwordHash, role, gender, position || department, department, joinDate, managerId || null,
       sickQuota, personalQuota, vacationQuota, ordinationQuota, militaryQuota, maternityQuota, sterilizationQuota, paternityQuota, isResigned === true, (isResigned === true && resignedDate) ? resignedDate : null, normalizeUserId(req.user?.id) || null, normalizeUserId(req.user?.id) || null]
    );
    if ((ins.rowCount ?? 0) > 0) {
      await runVacationQuotaRecalc(normalizeUserId(req.user?.id) || null, normalizeUserId(uid));
    }
    res.status(201).json({
      id: uid, name, email, role, gender, position: position || department, department, joinDate, managerId: managerId || null,
      isResigned: isResigned === true,
      resignedDate: (isResigned === true && resignedDate) ? resignedDate : '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('is_resigned') || message.includes('resigned_date')) {
      return res.status(400).json({ error: 'ยังไม่ได้รัน migration สำหรับสถานะลาออก (server/migrations/016_user_resignation_status.sql)' });
    }
    res.status(500).json({ error: message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    try {
      await ensureUserProfileAuditColumns();
    } catch (ensureErr) {
      console.warn('[users] ensure profile audit columns failed:', ensureErr instanceof Error ? ensureErr.message : ensureErr);
    }
    if (!req.user) return res.status(401).json({ error: 'ต้องล็อกอินก่อนใช้งาน' });
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const id = req.params.id;
    const { name, email, role, gender, position, department, joinDate, managerId, quotas, password, isSuspended, isResigned, resignedDate } = req.body;
    if (!id) return res.status(400).json({ error: 'ต้องมี id' });
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (typeof password === 'string' && password.trim() !== '') {
      const passwordHash = await bcrypt.hash(password.trim(), 10);
      updates.push(`password_hash = $${i++}`);
      values.push(passwordHash);
    }
    if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name); }
    if (email !== undefined) { updates.push(`email = $${i++}`); values.push(email); }
    if (role !== undefined) { updates.push(`role = $${i++}`); values.push(role); }
    if (gender !== undefined) { updates.push(`gender = $${i++}`); values.push(gender); }
    if (position !== undefined) { updates.push(`position = $${i++}`); values.push(position); }
    if (department !== undefined) { updates.push(`department = $${i++}`); values.push(department); }
    if (joinDate !== undefined) { updates.push(`join_date = $${i++}`); values.push(joinDate); }
    if (managerId !== undefined) { updates.push(`manager_id = $${i++}`); values.push(managerId || null); }
    if (isResigned !== undefined) {
      const resigned = isResigned === true;
      updates.push(`is_resigned = $${i++}`);
      values.push(resigned);
      updates.push(`resigned_date = $${i++}`);
      values.push(resigned ? (resignedDate || null) : null);
    } else if (resignedDate !== undefined) {
      updates.push(`resigned_date = $${i++}`);
      values.push(resignedDate || null);
    }
    if (quotas !== undefined && typeof quotas === 'object') {
      const qObj = quotas as Record<string, unknown>;
      if (qObj.sick !== undefined || qObj.SICK !== undefined) { updates.push(`sick_quota = $${i++}`); values.push(getQuotaValue(quotas, 'sick')); }
      if (qObj.personal !== undefined || qObj.PERSONAL !== undefined) { updates.push(`personal_quota = $${i++}`); values.push(getQuotaValue(quotas, 'personal')); }
      if (qObj.vacation !== undefined || qObj.VACATION !== undefined) { updates.push(`vacation_quota = $${i++}`); values.push(getQuotaValue(quotas, 'vacation')); }
      if (qObj.ordination !== undefined || qObj.ORDINATION !== undefined) { updates.push(`ordination_quota = $${i++}`); values.push(getQuotaValue(quotas, 'ordination')); }
      if (qObj.military !== undefined || qObj.MILITARY !== undefined) { updates.push(`military_quota = $${i++}`); values.push(getQuotaValue(quotas, 'military')); }
      if (qObj.maternity !== undefined || qObj.MATERNITY !== undefined) { updates.push(`maternity_quota = $${i++}`); values.push(getQuotaValue(quotas, 'maternity')); }
      if (qObj.sterilization !== undefined || qObj.STERILIZATION !== undefined) { updates.push(`sterilization_quota = $${i++}`); values.push(getQuotaValue(quotas, 'sterilization')); }
      if (qObj.paternity !== undefined || qObj.PATERNITY !== undefined) { updates.push(`paternity_quota = $${i++}`); values.push(getQuotaValue(quotas, 'paternity')); }
    }
    if (isSuspended !== undefined) {
      const suspended = isSuspended === true;
      updates.push(`is_suspended = $${i++}`);
      values.push(suspended);
      if (!suspended) {
        updates.push(`failed_login_attempts = $${i++}`);
        values.push(0);
        updates.push(`suspended_at = $${i++}`);
        values.push(null);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'ไม่มีฟิลด์ที่อัปเดต' });
    updates.push(`updated_by = $${i++}`);
    values.push(normalizeUserId(req.user.id));
    updates.push(`profile_updated_by = $${i++}`);
    values.push(normalizeUserId(req.user.id));
    values.push(id);
    try {
      await pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW(), profile_updated_at = NOW() WHERE id = $${i}`, values);
      await runVacationQuotaRecalc(normalizeUserId(req.user.id), normalizeUserId(id));
    } catch (uErr) {
      const msg = uErr instanceof Error ? uErr.message : '';
      if (msg.includes('position')) {
        return res.status(400).json({ error: 'ยังไม่ได้รัน migration สำหรับฟิลด์ตำแหน่ง (server/migrations/007_user_position_department.sql)' });
      }
      if (msg.includes('is_suspended') || msg.includes('failed_login_attempts')) {
        return res.status(400).json({ error: 'ยังไม่ได้รัน migration สำหรับฟังก์ชัน Suspend (server/migrations/006_user_security.sql)' });
      }
      if (msg.includes('invalid input syntax for type integer')) {
        return res.status(400).json({ error: 'ฐานข้อมูลยังไม่รองรับโควต้าแบบทศนิยม กรุณารัน migration: server/migrations/012_quota_decimal.sql' });
      }
      if (msg.includes('is_resigned') || msg.includes('resigned_date')) {
        return res.status(400).json({ error: 'ยังไม่ได้รัน migration สำหรับสถานะลาออก (server/migrations/016_user_resignation_status.sql)' });
      }
      throw uErr;
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.gender, u.position, u.department, u.join_date as "joinDate", u.manager_id as "managerId",
        u.sick_quota, u.personal_quota, u.vacation_quota, u.ordination_quota, 
        u.military_quota, u.maternity_quota, u.sterilization_quota, u.paternity_quota,
        COALESCE(u.is_resigned, FALSE) as "isResigned",
        COALESCE(u.resigned_date::text, '') as "resignedDate",
        COALESCE(u.profile_updated_at, u.updated_at) as "updatedAt",
        COALESCE(NULLIF(TRIM(COALESCE(u.profile_updated_by::text, '')), ''), NULLIF(TRIM(COALESCE(u.updated_by::text, '')), '')) as "updatedById",
        COALESCE(editor.name, '') as "updatedByName",
        COALESCE(u.is_suspended, FALSE) as "isSuspended",
        COALESCE(u.failed_login_attempts, 0) as "failedLoginAttempts"
      FROM users u
      LEFT JOIN users editor ON ${normIdSql('editor.id')} = ${normIdSql(`COALESCE(NULLIF(TRIM(COALESCE(u.profile_updated_by::text, '')), ''), NULLIF(TRIM(COALESCE(u.updated_by::text, '')), ''))`)}
      WHERE u.id = $1`, 
      [id]
    );
    if (rows[0]) {
      const { sick_quota, personal_quota, vacation_quota, ordination_quota, military_quota, maternity_quota, sterilization_quota, paternity_quota, ...rest } = rows[0];
      const r = rowToCamel(rest as Record<string, unknown>);
      res.json({ 
        ...r, 
        password: '',
        quotas: {
          sick: quotaOut(sick_quota),
          personal: quotaOut(personal_quota),
          vacation: quotaOut(vacation_quota),
          ordination: quotaOut(ordination_quota),
          military: quotaOut(military_quota),
          maternity: quotaOut(maternity_quota),
          sterilization: quotaOut(sterilization_quota),
          paternity: quotaOut(paternity_quota),
        }
      });
    } else {
      res.json(null);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/recalculate-vacation-quota-current', requireAuth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'ต้องล็อกอินก่อนใช้งาน' });
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};
    const targetUserId = normalizeUserId(body.userId) || null;

    const { rows } = await runVacationQuotaRecalc(normalizeUserId(req.user.id), targetUserId);

    res.json({
      updatedCount: rows.length,
      users: rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'ต้องมี id' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
