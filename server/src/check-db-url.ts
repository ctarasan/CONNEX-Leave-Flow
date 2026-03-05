/**
 * ตรวจสอบรูปแบบ DATABASE_URL (ไม่แสดงรหัสผ่าน)
 * รัน: npx tsx src/check-db-url.ts
 */
import 'dotenv/config';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[ERROR] DATABASE_URL ไม่ได้ตั้งค่าใน .env');
  process.exit(1);
}

try {
  const u = new URL(url.replace(/^postgresql:\/\//, 'https://'));
  const host = u.hostname;
  const port = u.port;
  const user = u.username;
  const db = u.pathname.replace(/^\//, '') || 'postgres';

  console.log('--- ตรวจสอบ DATABASE_URL (ไม่แสดงรหัสผ่าน) ---');
  console.log('โฮสต์:', host);
  console.log('พอร์ต:', port);
  console.log('Username:', user);
  console.log('Database:', db);
  console.log('ความยาว connection string:', url.length, 'ตัวอักษร');

  const isPooler = host.includes('pooler');
  const hasProjectRef = user.startsWith('postgres.') && user.length > 9;

  if (host.includes('supabase')) {
    if (!isPooler) {
      console.log('\n[คำเตือน] ใช้โฮสต์แบบ Direct (db.xxx.supabase.co) — บนเครือข่าย IPv4 อาจต่อไม่ได้');
      console.log('  แนะนำ: ใน Supabase เลือก Method = Session แล้ว copy URI ใหม่ (โฮสต์จะเป็น aws-0-xxx.pooler.supabase.com)');
    }
    if (isPooler && !hasProjectRef) {
      console.log('\n[คำเตือน] ใช้ Session Pooler แต่ username เป็น "postgres" — ต้องเป็น postgres.XXX (project-ref)');
      console.log('  ใน Supabase → Database → Connect → Method: Session → Copy URI (ในนั้นจะมี postgres.xxxxx)');
    }
    if (isPooler && hasProjectRef) {
      console.log('\n[OK] รูปแบบถูกต้อง: Pooler + username แบบ postgres.XXX');
    }
  }
} catch (e) {
  console.error('[ERROR] DATABASE_URL รูปแบบไม่ถูกต้อง:', e instanceof Error ? e.message : e);
  process.exit(1);
}
