import { Router } from 'express';
import { pool } from '../db.js';
import { rowToCamel } from '../util.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, color, applicable FROM leave_types ORDER BY id'
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
      isActive: true,
    }));
    res.json(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.put('/', async (req, res) => {
  try {
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
         ON CONFLICT (id) DO UPDATE SET name = $2, color = $3, applicable = $4`,
        [id, name, color, applicable]
      );
    }
    const { rows } = await pool.query('SELECT id, name, color, applicable FROM leave_types ORDER BY id');
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
      isActive: true,
    }));
    res.json(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
