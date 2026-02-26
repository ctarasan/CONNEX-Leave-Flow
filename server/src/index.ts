import 'dotenv/config';
import { checkConnection } from './db.js';
import app from './app.js';

// 5432/6543 เป็นพอร์ตของ Supabase DB — ใช้เฉพาะใน DATABASE_URL ไม่ใช่พอร์ตที่ให้ Express ฟัง
const rawPort = process.env.PORT ?? 3002;
const PORT = [5432, 6543].includes(Number(rawPort)) ? 3002 : Number(rawPort);
if (PORT !== Number(rawPort)) {
  console.warn(`[WARN] PORT ${rawPort} เป็นพอร์ตของ DB ใช้ไม่ได้ — ใช้ ${PORT} แทน (แก้ PORT ใน .env เป็น 3002)`);
}

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
