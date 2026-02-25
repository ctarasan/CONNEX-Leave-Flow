import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT date, name FROM holidays ORDER BY date');
    const map: Record<string, string> = {};
    for (const r of rows as { date: string; name: string }[]) {
      const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      map[d] = r.name;
    }
    res.json(map);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, name } = req.body;
    if (!date || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'ต้องมี date (YYYY-MM-DD) และ name' });
    }
    const safeName = String(name).trim().slice(0, 200);
    if (!safeName) return res.status(400).json({ error: 'name ต้องไม่ว่าง' });
    await pool.query(
      'INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = $2',
      [date, safeName]
    );
    res.status(201).json({ date, name: safeName });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.delete('/:date', async (req, res) => {
  try {
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
