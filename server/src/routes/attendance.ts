import { Router } from 'express';
import { pool } from '../db.js';
import { rowToCamel } from '../util.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    let query = 'SELECT id, user_id as "userId", date, check_in as "checkIn", check_out as "checkOut", status, (check_in IS NOT NULL AND check_in > \'09:30:00\') AS "isLate" FROM attendance';
    const params: string[] = [];
    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY date DESC';
    const { rows } = await pool.query(query, params.length ? params : undefined);
    const list = (rows as Record<string, unknown>[]).map(r => {
      const o = rowToCamel(r);
      if (o.checkIn && typeof o.checkIn === 'object') o.checkIn = String(o.checkIn).slice(0, 8);
      if (o.checkOut && typeof o.checkOut === 'object') o.checkOut = String(o.checkOut).slice(0, 8);
      return o;
    });
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { userId, type, date, checkIn, checkOut } = req.body;
    
    // Support two formats:
    // 1. { userId, type: 'IN' | 'OUT' } - real-time check in/out
    // 2. { userId, date, checkIn, checkOut } - manual entry
    
    if (!userId) {
      return res.status(400).json({ error: 'ต้องมี userId' });
    }
    
    let dateStr: string;
    let checkInTime: string | null = null;
    let checkOutTime: string | null = null;
    let isLate = false;
    
    if (type && ['IN', 'OUT'].includes(type)) {
      // Format 1: Real-time check in/out
      const now = new Date();
      dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().slice(0, 8);
      isLate = type === 'IN' && timeStr > '09:30:00';
      checkInTime = type === 'IN' ? timeStr : null;
      checkOutTime = type === 'OUT' ? timeStr : null;
    } else if (date) {
      // Format 2: Manual entry
      dateStr = date;
      checkInTime = checkIn || null;
      checkOutTime = checkOut || null;
      isLate = checkInTime ? checkInTime > '09:30:00' : false;
    } else {
      return res.status(400).json({ error: 'ต้องมี type (IN/OUT) หรือ date' });
    }
    
    await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status)
       VALUES ($1, $2, $3, $4, 'present')
       ON CONFLICT (user_id, date) DO UPDATE SET
         check_in = COALESCE($3, attendance.check_in),
         check_out = COALESCE($4, attendance.check_out)`,
      [userId, dateStr, checkInTime, checkOutTime]
    );
    
    const { rows } = await pool.query(
      'SELECT id, user_id as "userId", date, check_in as "checkIn", check_out as "checkOut", status, (check_in IS NOT NULL AND check_in > \'09:30:00\') AS "isLate" FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, dateStr]
    );
    const r = rows[0];
    if (r) {
      const o = rowToCamel(r as Record<string, unknown>);
      if (o.checkIn && typeof o.checkIn === 'object') o.checkIn = String(o.checkIn).slice(0, 8);
      if (o.checkOut && typeof o.checkOut === 'object') o.checkOut = String(o.checkOut).slice(0, 8);
      return res.status(201).json(o);
    }
    res.status(201).json({ userId, date: dateStr, checkIn: checkInTime, checkOut: checkOutTime, status: 'present' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
