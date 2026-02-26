import { Router } from 'express';
import { pool } from '../db.js';
import { rowToCamel } from '../util.js';

const router = Router();

/** ดึง IP ของ client (รองรับ proxy/Vercel: X-Forwarded-For, X-Real-IP) */
function getClientIp(req: { ip?: string; socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (typeof first === 'string' ? first : '').split(',')[0].trim() || '';
  }
  const realIp = req.headers?.['x-real-ip'];
  if (realIp) return (Array.isArray(realIp) ? realIp[0] : realIp) || '';
  if (req.ip) return req.ip;
  return req.socket?.remoteAddress ?? '';
}

/**
 * ตรวจว่า IP อยู่ในเครือข่ายออฟฟิศหรือไม่
 * OFFICE_IP_RANGES = ค่าใน env (เช่น "192.168.,10.0.,1.2.3.4") คั่นด้วย comma
 * ถ้าไม่ตั้งค่า = อนุญาตทั้งหมด ( backward compatibility )
 */
function isAllowedOfficeNetwork(clientIp: string): boolean {
  const raw = process.env.OFFICE_IP_RANGES;
  if (!raw || !clientIp) return true;
  const ranges = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (ranges.length === 0) return true;
  return ranges.some(r => clientIp === r || clientIp.startsWith(r));
}

/** GET /api/attendance/verify-network — ตรวจว่า client อยู่บนเครือข่ายออฟฟิศหรือไม่ (สำหรับปุ่ม "ตรวจสอบเครือข่าย WiFi") */
router.get('/verify-network', (req, res) => {
  const clientIp = getClientIp(req);
  const allowed = isAllowedOfficeNetwork(clientIp);
  res.json({ allowed, clientIp: allowed ? undefined : clientIp });
});

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
    const clientIp = getClientIp(req);
    if (!isAllowedOfficeNetwork(clientIp)) {
      return res.status(403).json({
        error: 'ไม่อนุญาต: กรุณาลงเวลาจากเครือข่ายออฟฟิศ (WiFi/เครือข่ายภายในบริษัท) เท่านั้น',
        code: 'NETWORK_NOT_ALLOWED',
      });
    }

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
