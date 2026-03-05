import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
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

/** GET /api/auth/session-check — ใช้เช็กว่า token ยังเป็น session ล่าสุดหรือไม่ (frontend เรียกเมื่อมีกิจกรรม เช่น ขยับเมาส์) */
router.get('/session-check', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ', code: 'UNAUTHORIZED' });
  }
  res.json({ ok: true });
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
    // ใช้ query ที่ใช้ได้กับ init-supabase (users มีเฉพาะ id, name, email, password_hash, role, gender, department, join_date, manager_id, quotas JSONB)
    const { rows } = await pool.query(
      `SELECT id, name, email, role, gender, department, join_date as "joinDate", manager_id as "managerId", password_hash, COALESCE(quotas, '{}'::jsonb) as quotas
       FROM users WHERE LOWER(TRIM(email)) = LOWER($1)`,
      [emailTrimmed]
    );
    const row = rows[0] as { password_hash: string; id: string; role: string; quotas?: Record<string, number>; [k: string]: unknown } | undefined;
    if (!row) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    const passwordTrimmed = String(password).trim();
    const hashFromDb = (row.password_hash ?? '').toString().trim();
    const ok = hashFromDb ? await bcrypt.compare(passwordTrimmed, hashFromDb) : false;
    if (!ok) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }
    const { password_hash: _, quotas: quotasJson, ...user } = row;
    const out = rowToCamel(user as Record<string, unknown>) as Record<string, unknown>;
    out.password = '';
    const q = quotasJson && typeof quotasJson === 'object'
      ? { sick: 0, personal: 0, vacation: 0, ordination: 0, military: 0, maternity: 0, sterilization: 0, paternity: 0, other: 0, ...quotasJson }
      : { sick: 0, personal: 0, vacation: 0, ordination: 0, military: 0, maternity: 0, sterilization: 0, paternity: 0 };
    out.quotas = q;
    const sessionId = crypto.randomUUID();
    const token = signToken({ id: row.id, role: row.role, email: row.email as string, sessionId });
    try {
      await pool.query(
        `INSERT INTO user_sessions (user_id, session_id, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET session_id = $2, updated_at = NOW()`,
        [row.id, sessionId]
      );
    } catch (sessionErr) {
      // ตาราง user_sessions อาจยังไม่มี (ยังไม่รัน migration 003) — ให้ login ผ่านไปก่อน
      console.warn('[auth] user_sessions insert failed:', sessionErr instanceof Error ? sessionErr.message : sessionErr);
    }
    res.json({ user: out, token });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
