import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export interface AuthUser {
  id: string;
  role: string;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** อ่าน JWT จาก Authorization: Bearer <token> แล้วใส่ req.user (ไม่บังคับ) */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = { id: payload.id, role: payload.role, email: payload.email };
  } catch {
    // token หมดอายุหรือไม่ถูกต้อง — ไม่ใส่ req.user
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

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
