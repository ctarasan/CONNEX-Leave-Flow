import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT lt.id, lt.name, lt.color, lt.applicable,
         lt.updated_by AS "updatedById",
         COALESCE(u.name, '') AS "updatedByName"
       FROM leave_types lt
       LEFT JOIN users u ON u.id = lt.updated_by
       ORDER BY lt.id`
    );
    const byKey = new Map<string, Record<string, unknown>>();
    for (const r of rows as Record<string, unknown>[]) {
      const id = String(r.id ?? '').toUpperCase();
      if (!byKey.has(id)) byKey.set(id, r);
    }
    const uniqueRows = Array.from(byKey.values());
    const mapped = uniqueRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      label: r.name,
      name: r.name,
      color: r.color,
      applicable: r.applicable,
      applicableTo: r.applicable,
      updatedById: r.updatedById,
      updatedByName: r.updatedByName,
      isActive: true,
    }));
    res.json(mapped);
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
    for (const t of types) {
      const rawId = String(t.id ?? '').trim();
      const id = rawId.toLowerCase();
      const name = t.name ?? t.label ?? rawId;
      const color = t.color ?? '#3b82f6';
      const applicable = t.applicable ?? t.applicableTo ?? t.applicable_to ?? 'both';
      await pool.query(
        `INSERT INTO leave_types (id, name, color, applicable)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET name = $2, color = $3, applicable = $4, updated_at = NOW(), updated_by = $5`,
        [id, name, color, applicable, req.user?.id ?? null]
      );
      await pool.query(`UPDATE leave_types SET updated_by = $2 WHERE id = $1 AND updated_by IS NULL`, [id, req.user?.id ?? null]);
    }
    const { rows } = await pool.query(
      `SELECT lt.id, lt.name, lt.color, lt.applicable,
         lt.updated_by AS "updatedById",
         COALESCE(u.name, '') AS "updatedByName"
       FROM leave_types lt
       LEFT JOIN users u ON u.id = lt.updated_by
       ORDER BY lt.id`
    );
    const byKey = new Map<string, Record<string, unknown>>();
    for (const r of rows as Record<string, unknown>[]) {
      const id = String(r.id ?? '').toUpperCase();
      if (!byKey.has(id)) byKey.set(id, r);
    }
    const uniqueRows = Array.from(byKey.values());
    const mapped = uniqueRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      label: r.name,
      name: r.name,
      color: r.color,
      applicable: r.applicable,
      applicableTo: r.applicable,
      updatedById: r.updatedById,
      updatedByName: r.updatedByName,
      isActive: true,
    }));
    res.json(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
