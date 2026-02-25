import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { checkConnection } from './db.js';
import leaveTypesRouter from './routes/leaveTypes.js';
import usersRouter from './routes/users.js';
import leaveRequestsRouter from './routes/leaveRequests.js';
import holidaysRouter from './routes/holidays.js';
import authRouter from './routes/auth.js';
import attendanceRouter from './routes/attendance.js';
import notificationsRouter from './routes/notifications.js';
import { optionalAuth } from './middleware/auth.js';

const app = express();
// 5432/6543 เป็นพอร์ตของ Supabase DB — ใช้เฉพาะใน DATABASE_URL ไม่ใช่พอร์ตที่ให้ Express ฟัง
// ค่าเริ่มต้น 3002 เพื่อไม่ชนกับ Vite (มักใช้ 3000/3001)
const rawPort = process.env.PORT ?? 3002;
const PORT = [5432, 6543].includes(Number(rawPort)) ? 3002 : Number(rawPort);
if (PORT !== Number(rawPort)) {
  console.warn(`[WARN] PORT ${rawPort} เป็นพอร์ตของ DB ใช้ไม่ได้ — ใช้ ${PORT} แทน (แก้ PORT ใน .env เป็น 3002)`);
}

app.use(cors());
app.use(express.json());

// Set charset for all responses
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

app.use(optionalAuth);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Backend is running' });
});

app.get('/api/health/db', async (_req, res) => {
  try {
    const ok = await checkConnection();
    res.json({ ok, message: ok ? 'Database connected' : 'Database check failed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ ok: false, message: `Database error: ${message}` });
  }
});

/** สถานะรวม: ใช้เช็กว่า app ติดต่อ DB เรียบร้อยหรือไม่ */
app.get('/api/status', async (_req, res) => {
  let dbOk = false;
  let dbMessage = '';
  try {
    dbOk = await checkConnection();
    dbMessage = dbOk ? 'Database connected (Supabase)' : 'Database check failed';
  } catch (err) {
    dbMessage = err instanceof Error ? err.message : 'Unknown error';
  }
  res.json({
    server: true,
    database: dbOk,
    message: dbOk
      ? 'Backend and Supabase DB are connected.'
      : `Backend is running but DB failed: ${dbMessage}`,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/leave-types', leaveTypesRouter);
app.use('/api/users', usersRouter);
app.use('/api/leave-requests', leaveRequestsRouter);
app.use('/api/holidays', holidaysRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/notifications', notificationsRouter);

function tryListen(port: number, maxTries = 5): void {
  const server = app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
    console.log('  GET /api/health     - server health');
    console.log('  GET /api/health/db  - database connection check');
    console.log('  GET /api/status     - backend + DB status (ใช้เช็กว่าต่อ Supabase เรียบร้อย)');
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && maxTries > 1) {
      console.warn(`[WARN] พอร์ต ${port} ถูกใช้อยู่ — ลองพอร์ต ${port + 1}`);
      server.close(() => tryListen(port + 1, maxTries - 1));
    } else {
      console.error('Failed to start:', err.message);
      process.exit(1);
    }
  });
}

async function start() {
  try {
    const dbOk = await checkConnection();
    console.log(dbOk ? '[OK] Database connected' : '[WARN] Database check failed');
  } catch (err) {
    console.error('[ERROR] Database connection failed:', err instanceof Error ? err.message : err);
  }

  tryListen(PORT);
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
