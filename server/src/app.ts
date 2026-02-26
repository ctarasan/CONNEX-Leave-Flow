import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import leaveTypesRouter from './routes/leaveTypes.js';
import usersRouter from './routes/users.js';
import leaveRequestsRouter from './routes/leaveRequests.js';
import holidaysRouter from './routes/holidays.js';
import authRouter from './routes/auth.js';
import attendanceRouter from './routes/attendance.js';
import notificationsRouter from './routes/notifications.js';
import { optionalAuth } from './middleware/auth.js';
import { checkConnection } from './db.js';

const app = express();

app.use(cors());
app.use(express.json());

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

export default app;
