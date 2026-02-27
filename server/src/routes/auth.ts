import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { rowToCamel } from '../util.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

/** เช็กว่ามี user ตามอีเมลหรือไม่ (ใช้ยืนยันว่า Backend ชี้ไปที่ DB เดียวกับที่คุณดูใน Supabase) */
router.get('/check-email', async (req, res) => {
  try {
    const email = req.query.email as string;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'ต้องส่ง query email' });
    }
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER($1)',
      [email.trim()]
    );
    return res.json({ exists: rows.length > 0, id: rows[0]?.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'ต้องมี email และ password' });
    }
    const emailTrimmed = String(email).trim();
    // #region agent log
    fetch('http://127.0.0.1:7674/ingest/df21c9fd-6b65-40c3-af5e-5cbb5dd5b203', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ab67f8' }, body: JSON.stringify({ sessionId: 'ab67f8', location: 'auth.ts:login', message: 'login attempt', data: { emailLength: emailTrimmed.length, passwordLength: String(password).length }, timestamp: Date.now(), hypothesisId: 'H2,H3' }) }).catch(() => {});
    // #endregion
    const { rows } = await pool.query(
      `SELECT id, name, email, role, gender, department, join_date as "joinDate", manager_id as "managerId", 
        sick_quota, personal_quota, vacation_quota, ordination_quota, 
        military_quota, maternity_quota, sterilization_quota, paternity_quota,
        password_hash 
      FROM users WHERE LOWER(TRIM(email)) = LOWER($1)`,
      [emailTrimmed]
    );
    const row = rows[0] as { password_hash: string; id: string; role: string; [k: string]: unknown } | undefined;
    // #region agent log
    fetch('http://127.0.0.1:7674/ingest/df21c9fd-6b65-40c3-af5e-5cbb5dd5b203', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ab67f8' }, body: JSON.stringify({ sessionId: 'ab67f8', location: 'auth.ts:afterQuery', message: 'user lookup', data: { hasUser: !!row, userId: row?.id }, timestamp: Date.now(), hypothesisId: 'H2,H3' }) }).catch(() => {});
    // #endregion
    if (!row) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    const passwordTrimmed = String(password).trim();
    const hashFromDb = (row.password_hash ?? '').toString().trim();
    const ok = hashFromDb ? await bcrypt.compare(passwordTrimmed, hashFromDb) : false;
    // #region agent log
    fetch('http://127.0.0.1:7674/ingest/df21c9fd-6b65-40c3-af5e-5cbb5dd5b203', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ab67f8' }, body: JSON.stringify({ sessionId: 'ab67f8', location: 'auth.ts:compare', message: 'bcrypt compare result', data: { compareOk: ok }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => {});
    // #endregion
    if (!ok) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    const { password_hash: _, sick_quota, personal_quota, vacation_quota, ordination_quota, military_quota, maternity_quota, sterilization_quota, paternity_quota, ...user } = row;
    const out = rowToCamel(user as Record<string, unknown>) as Record<string, unknown>;
    out.password = '';
    out.quotas = {
      sick: sick_quota || 0,
      personal: personal_quota || 0,
      vacation: vacation_quota || 0,
      ordination: ordination_quota || 0,
      military: military_quota || 0,
      maternity: maternity_quota || 0,
      sterilization: sterilization_quota || 0,
      paternity: paternity_quota || 0,
    };
    const token = signToken({ id: row.id, role: row.role, email: row.email as string });
    res.json({ user: out, token });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
