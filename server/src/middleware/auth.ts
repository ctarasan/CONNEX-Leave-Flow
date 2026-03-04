import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export interface AuthUser {
  id: string;
  role: string;
  email?: string;
}

/** Payload ใน JWT อาจมี sessionId (ใช้ตรวจว่าเป็น session ล่าสุดของ user หรือไม่) */
export interface JwtPayload extends AuthUser {
  sessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** payload จาก JWT (มี sessionId ถ้าเป็น token ที่ออกหลังเปิด one-device) */
      authPayload?: JwtPayload;
    }
  }
}

/** อ่าน JWT จาก Authorization: Bearer <token> แล้วใส่ req.user และ req.authPayload */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.authPayload = payload;
    req.user = { id: payload.id, role: payload.role, email: payload.email };
  } catch {
    // token หมดอายุหรือไม่ถูกต้อง — ไม่ใส่ req.user
  }
  next();
}

/** ตรวจว่า token ยังเป็น session ปัจจุบันของ user หรือไม่ (หนึ่ง user ต่อหนึ่ง device) */
export async function checkSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user || !req.authPayload) {
    next();
    return;
  }
  const sessionId = req.authPayload.sessionId;
  if (!sessionId) {
    next();
    return;
  }
  try {
    const { rows } = await pool.query<{ session_id: string }>(
      'SELECT session_id FROM user_sessions WHERE user_id = $1',
      [req.user.id]
    );
    const current = rows[0]?.session_id;
    if (current != null && current !== sessionId) {
      res.status(401).json({
        error: 'คุณได้เข้าสู่ระบบจากอุปกรณ์อื่น จึงออกจากระบบบนอุปกรณ์นี้แล้ว',
        code: 'SESSION_REPLACED',
      });
      return;
    }
  } catch {
    next();
    return;
  }
  next();
}

/** บังคับต้องมี req.user (ใช้หลัง optionalAuth) */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'ต้องล็อกอินก่อนใช้งาน' });
    return;
  }
  next();
}

export function signToken(payload: AuthUser & { sessionId?: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
