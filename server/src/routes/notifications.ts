import { Router } from 'express';
import { pool } from '../db.js';
import { rowToCamel } from '../util.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    if (!userId) {
      return res.status(400).json({ error: 'ต้องมี userId' });
    }
    const { rows } = await pool.query(
      'SELECT id, user_id as "userId", title, message, is_read as "isRead", created_at as "createdAt" FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(rows.map((r: Record<string, unknown>) => rowToCamel(r)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { userId, title, message } = req.body;
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'ต้องมี userId, title, message' });
    }
    // Let DB generate ID (SERIAL)
    const { rows } = await pool.query(
      'INSERT INTO notifications (user_id, title, message, is_read) VALUES ($1, $2, $3, false) RETURNING id, user_id as "userId", title, message, is_read as "isRead", created_at as "createdAt"',
      [userId, String(title).slice(0, 500), String(message).slice(0, 2000)]
    );
    const r = rows[0] ? rowToCamel(rows[0] as Record<string, unknown>) : null;
    res.status(201).json(r);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.query.userId as string | undefined;
    if (!id) return res.status(400).json({ error: 'ต้องมี id' });
    const q = userId
      ? pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId])
      : pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
    await q;
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
