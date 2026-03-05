import 'dotenv/config';
import { checkConnection } from './db.js';

function safeUrlHint(url: string): void {
  try {
    const u = new URL(url.replace(/^postgresql:\/\//, 'https://'));
    const user = u.username || '';
    const host = u.hostname || '';
    if (host.includes('pooler') && user === 'postgres') {
      console.error('\n[คำแนะนำ] ใช้ Session Pooler ต้องใช้ username แบบ postgres.XXX (เช่น postgres.cawktiitkxxnxaefnkto) ไม่ใช่แค่ postgres');
      console.error('  ใน Supabase → Database → Connect → Method: Session → Copy URI แล้วใส่ใน .env\n');
    }
  } catch {
    // ignore parse error
  }
}

checkConnection()
  .then((ok) => {
    console.log(ok ? '[OK] Database connected.' : '[FAIL] Database check returned false.');
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('[ERROR]', err.message);
    if (/SASL|authentication|password/i.test(err.message)) {
      const url = process.env.DATABASE_URL || '';
      safeUrlHint(url);
      console.error('  หรือลอง Reset database password ใน Supabase แล้วใส่รหัสผ่านใหม่ใน .env (ถ้ามีอักขระพิเศษให้ encode: @→%40 #→%23 :→%3A)');
    }
    process.exit(1);
  });
