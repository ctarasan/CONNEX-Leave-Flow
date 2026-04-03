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

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT h.date, h.name,
         h.updated_at AS "updatedAt",
         h.updated_by AS "updatedById",
         COALESCE(u.name, '') AS "updatedByName"
       FROM holidays h
       LEFT JOIN users u ON ${normIdSql('u.id')} = ${normIdSql('h.updated_by')}
       ORDER BY h.date`
    );
    const list = (rows as Array<{ date: string; name: string; updatedAt?: string; updatedById?: string; updatedByName?: string }>).map((r) => ({
      date: (r.date as unknown) instanceof Date ? (r.date as unknown as Date).toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      name: r.name,
      updatedAt: r.updatedAt ?? '',
      updatedById: r.updatedById ?? '',
      updatedByName: r.updatedByName ?? '',
    }));
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const { date, name } = req.body;
    if (!date || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'ต้องมี date (YYYY-MM-DD) และ name' });
    }
    const safeName = String(name).trim().slice(0, 200);
    if (!safeName) return res.status(400).json({ error: 'name ต้องไม่ว่าง' });
    await pool.query(
      `INSERT INTO holidays (date, name, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (date) DO UPDATE SET name = $2, updated_at = NOW(), updated_by = $3`,
      [date, safeName, normalizeUserId(req.user?.id) || null]
    );
    res.status(201).json({ date, name: safeName });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.delete('/:date', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    const date = req.params.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date ต้องเป็น YYYY-MM-DD' });
    }
    const { rowCount } = await pool.query('DELETE FROM holidays WHERE date = $1', [date]);
    res.json({ deleted: (rowCount ?? 0) > 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
