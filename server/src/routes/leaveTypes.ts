import { Router } from 'express';
import { pool } from '../db.js';
import { normalizeUserId } from '../util.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const normIdSql = (col: string): string =>
  `(CASE
     WHEN TRIM(COALESCE((${col})::text, '')) ~ '^[0-9]+$'
       THEN LPAD(((TRIM(((${col})::text)))::int)::text, 3, '0')
     ELSE TRIM(COALESCE((${col})::text, ''))
   END)`;

type LeaveTypeDbRow = {
  id: string;
  name: string;
  color: string;
  applicable: string;
  defaultQuota?: number | string;
  updatedAt?: string;
  updatedById?: string;
  updatedByName?: string;
};

type LeaveTypeCapabilities = {
  auditEnabled: boolean;
  quotaEnabled: boolean;
};

async function readLeaveTypeCapabilities(): Promise<LeaveTypeCapabilities> {
  const { rows } = await pool.query<{ has_updated_by: boolean; has_updated_at: boolean; has_default_quota: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'leave_types' AND column_name = 'updated_by'
       ) AS has_updated_by,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'leave_types' AND column_name = 'updated_at'
       ) AS has_updated_at,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'leave_types' AND column_name = 'default_quota'
       ) AS has_default_quota`
  );
  return {
    auditEnabled: rows[0]?.has_updated_by === true && rows[0]?.has_updated_at === true,
    quotaEnabled: rows[0]?.has_default_quota === true,
  };
}

async function ensureLeaveTypeColumns(): Promise<LeaveTypeCapabilities> {
  try {
    const initial = await readLeaveTypeCapabilities();
    if (!initial.auditEnabled) {
      await pool.query(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);
      await pool.query(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS updated_by VARCHAR(10)`);
      await pool.query(`UPDATE leave_types SET updated_at = COALESCE(updated_at, NOW())`);
    }
    if (!initial.quotaEnabled) {
      await pool.query(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS default_quota NUMERIC(10,2) DEFAULT 0`);
      await pool.query(`UPDATE leave_types SET default_quota = COALESCE(default_quota, 0)`);
    }
    return await readLeaveTypeCapabilities();
  } catch {
    try {
      return await readLeaveTypeCapabilities();
    } catch {
      return { auditEnabled: false, quotaEnabled: false };
    }
  }
}

async function fetchLeaveTypes(cap: LeaveTypeCapabilities): Promise<LeaveTypeDbRow[]> {
  if (cap.auditEnabled && cap.quotaEnabled) {
    const { rows } = await pool.query<LeaveTypeDbRow>(
      `SELECT lt.id, lt.name, lt.color, lt.applicable,
         lt.default_quota AS "defaultQuota",
         lt.updated_at AS "updatedAt",
         lt.updated_by AS "updatedById",
         COALESCE(u.name, '') AS "updatedByName"
       FROM leave_types lt
       LEFT JOIN users u ON ${normIdSql('u.id')} = ${normIdSql('lt.updated_by')}
       ORDER BY lt.id`
    );
    return rows;
  }
  if (cap.auditEnabled) {
    const { rows } = await pool.query<LeaveTypeDbRow>(
      `SELECT lt.id, lt.name, lt.color, lt.applicable,
         lt.updated_at AS "updatedAt",
         lt.updated_by AS "updatedById",
         COALESCE(u.name, '') AS "updatedByName"
       FROM leave_types lt
       LEFT JOIN users u ON ${normIdSql('u.id')} = ${normIdSql('lt.updated_by')}
       ORDER BY lt.id`
    );
    return rows;
  }
  if (cap.quotaEnabled) {
    const { rows } = await pool.query<LeaveTypeDbRow>(
      `SELECT id, name, color, applicable, default_quota AS "defaultQuota" FROM leave_types ORDER BY id`
    );
    return rows.map((r) => ({ ...r, updatedAt: '', updatedById: '', updatedByName: '' }));
  }
  const { rows } = await pool.query<LeaveTypeDbRow>(
    `SELECT id, name, color, applicable FROM leave_types ORDER BY id`
  );
  return rows.map((r) => ({ ...r, updatedAt: '', updatedById: '', updatedByName: '' }));
}

function mapLeaveTypes(rows: LeaveTypeDbRow[]) {
  const byKey = new Map<string, LeaveTypeDbRow>();
  for (const r of rows) {
    const id = String(r.id ?? '').toUpperCase();
    if (!byKey.has(id)) byKey.set(id, r);
  }
  return Array.from(byKey.values()).map((r) => ({
    id: r.id,
    label: r.name,
    name: r.name,
    color: r.color,
    applicable: r.applicable,
    applicableTo: r.applicable,
    defaultQuota: Number.isFinite(Number(r.defaultQuota)) ? Number(r.defaultQuota) : 0,
    updatedAt: String(r.updatedAt ?? ''),
    updatedById: r.updatedById ?? '',
    updatedByName: r.updatedByName ?? '',
    isActive: true,
  }));
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    const cap = await ensureLeaveTypeColumns();
    const rows = await fetchLeaveTypes(cap);
    res.json(mapLeaveTypes(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const types = Array.isArray(req.body) ? req.body : req.body.types;
    if (!Array.isArray(types) || types.length === 0) {
      return res.status(400).json({ error: 'ต้องส่ง array ของ leave types' });
    }
    const cap = await ensureLeaveTypeColumns();
    const actorId = normalizeUserId(req.user?.id) || null;
    const existingRes = await pool.query<{
      id: string;
      name: string;
      color: string;
      applicable: string;
      defaultQuota?: number | string;
    }>(
      cap.quotaEnabled
        ? `SELECT id, name, color, applicable, default_quota AS "defaultQuota" FROM leave_types`
        : `SELECT id, name, color, applicable FROM leave_types`
    );
    const existingById = new Map(
      existingRes.rows.map((r) => [String(r.id).toLowerCase(), r])
    );

    for (const t of types) {
      const rawId = String(t.id ?? '').trim();
      if (!rawId) continue;
      const id = rawId.toLowerCase();
      const prev = existingById.get(id);
      const name = String(t.name ?? t.label ?? prev?.name ?? rawId).trim();
      const color = String(t.color ?? prev?.color ?? '#3b82f6').trim() || '#3b82f6';
      const applicable = String(t.applicable ?? t.applicableTo ?? t.applicable_to ?? prev?.applicable ?? 'both').trim() || 'both';
      const defaultQuotaRaw = Number(t.defaultQuota ?? t.default_quota ?? prev?.defaultQuota ?? 0);
      const defaultQuota = Number.isFinite(defaultQuotaRaw) ? Math.max(0, defaultQuotaRaw) : 0;

      if (!prev) {
        if (cap.auditEnabled && cap.quotaEnabled) {
          await pool.query(
            `INSERT INTO leave_types (id, name, color, applicable, default_quota, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [id, name, color, applicable, defaultQuota, actorId]
          );
        } else if (cap.auditEnabled) {
          await pool.query(
            `INSERT INTO leave_types (id, name, color, applicable, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [id, name, color, applicable, actorId]
          );
        } else if (cap.quotaEnabled) {
          await pool.query(
            `INSERT INTO leave_types (id, name, color, applicable, default_quota)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, name, color, applicable, defaultQuota]
          );
        } else {
          await pool.query(
            `INSERT INTO leave_types (id, name, color, applicable)
             VALUES ($1, $2, $3, $4)`,
            [id, name, color, applicable]
          );
        }
        existingById.set(id, { id, name, color, applicable, defaultQuota });
        continue;
      }

      const prevQuota = Number(prev.defaultQuota ?? 0);
      const changed = prev.name !== name || prev.color !== color || prev.applicable !== applicable || (cap.quotaEnabled && prevQuota !== defaultQuota);
      if (!changed) continue;

      if (cap.auditEnabled && cap.quotaEnabled) {
        await pool.query(
          `UPDATE leave_types
           SET name = $2,
               color = $3,
               applicable = $4,
               default_quota = $5,
               updated_at = NOW(),
               updated_by = $6
           WHERE id = $1`,
          [id, name, color, applicable, defaultQuota, actorId]
        );
      } else if (cap.auditEnabled) {
        await pool.query(
          `UPDATE leave_types
           SET name = $2,
               color = $3,
               applicable = $4,
               updated_at = NOW(),
               updated_by = $5
           WHERE id = $1`,
          [id, name, color, applicable, actorId]
        );
      } else if (cap.quotaEnabled) {
        await pool.query(
          `UPDATE leave_types
           SET name = $2,
               color = $3,
               applicable = $4,
               default_quota = $5
           WHERE id = $1`,
          [id, name, color, applicable, defaultQuota]
        );
      } else {
        await pool.query(
          `UPDATE leave_types
           SET name = $2,
               color = $3,
               applicable = $4
           WHERE id = $1`,
          [id, name, color, applicable]
        );
      }
      existingById.set(id, { id, name, color, applicable, defaultQuota });
    }
    const rows = await fetchLeaveTypes(cap);
    res.json(mapLeaveTypes(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const id = String(req.params.id ?? '').trim().toLowerCase();
    if (!id) return res.status(400).json({ error: 'ต้องมี id' });
    const cap = await ensureLeaveTypeColumns();

    const existing = await pool.query<{ id: string; name: string; color: string; applicable: string; defaultQuota?: number | string }>(
      cap.quotaEnabled
        ? `SELECT id, name, color, applicable, default_quota AS "defaultQuota" FROM leave_types WHERE id = $1 LIMIT 1`
        : `SELECT id, name, color, applicable FROM leave_types WHERE id = $1 LIMIT 1`,
      [id]
    );
    const prev = existing.rows[0];
    if (!prev) return res.status(404).json({ error: 'ไม่พบประเภทวันลาที่ต้องการแก้ไข' });

    const nextName = String(req.body?.name ?? req.body?.label ?? prev.name).trim();
    const nextColor = String(req.body?.color ?? prev.color ?? '#3b82f6').trim() || '#3b82f6';
    const nextApplicable = String(req.body?.applicable ?? req.body?.applicableTo ?? req.body?.applicable_to ?? prev.applicable ?? 'both').trim() || 'both';
    const nextDefaultQuotaRaw = Number(req.body?.defaultQuota ?? req.body?.default_quota ?? prev.defaultQuota ?? 0);
    const nextDefaultQuota = Number.isFinite(nextDefaultQuotaRaw) ? Math.max(0, nextDefaultQuotaRaw) : 0;

    const prevDefaultQuota = Number(prev.defaultQuota ?? 0);
    const changed = prev.name !== nextName || prev.color !== nextColor || prev.applicable !== nextApplicable || (cap.quotaEnabled && prevDefaultQuota !== nextDefaultQuota);
    if (changed) {
      if (cap.auditEnabled && cap.quotaEnabled) {
        await pool.query(
          `UPDATE leave_types
           SET name = $2, color = $3, applicable = $4, default_quota = $5, updated_at = NOW(), updated_by = $6
           WHERE id = $1`,
          [id, nextName, nextColor, nextApplicable, nextDefaultQuota, normalizeUserId(req.user?.id) || null]
        );
      } else if (cap.auditEnabled) {
        await pool.query(
          `UPDATE leave_types
           SET name = $2, color = $3, applicable = $4, updated_at = NOW(), updated_by = $5
           WHERE id = $1`,
          [id, nextName, nextColor, nextApplicable, normalizeUserId(req.user?.id) || null]
        );
      } else if (cap.quotaEnabled) {
        await pool.query(
          `UPDATE leave_types
           SET name = $2, color = $3, applicable = $4, default_quota = $5
           WHERE id = $1`,
          [id, nextName, nextColor, nextApplicable, nextDefaultQuota]
        );
      } else {
        await pool.query(
          `UPDATE leave_types
           SET name = $2, color = $3, applicable = $4
           WHERE id = $1`,
          [id, nextName, nextColor, nextApplicable]
        );
      }
    }

    const rows = await fetchLeaveTypes(cap);
    const row = rows.find((x) => String(x.id).toLowerCase() === id);
    if (!row) return res.status(404).json({ error: 'ไม่พบประเภทวันลาที่ต้องการแก้ไข' });
    return res.json({
      id: row.id,
      label: row.name,
      name: row.name,
      color: row.color,
      applicable: row.applicable,
      applicableTo: row.applicable,
      defaultQuota: Number.isFinite(Number(row.defaultQuota)) ? Number(row.defaultQuota) : 0,
      updatedAt: String(row.updatedAt ?? ''),
      updatedById: row.updatedById ?? '',
      updatedByName: row.updatedByName ?? '',
      isActive: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

export default router;
