/**
 * สร้าง bcrypt hash สำหรับรหัสผ่าน แล้วพิมพ์ SQL ให้ไปรันใน Supabase
 * ใช้เมื่อล็อกอินไม่ได้เพราะ password_hash ใน DB ไม่ตรงกับรหัสผ่านที่ใช้
 *
 * วิธีใช้ (จากโฟลเดอร์ server):
 *   node scripts/reset-password-hash.mjs [รหัสผ่าน] [อีเมล]
 *
 * ตัวอย่าง:
 *   node scripts/reset-password-hash.mjs 001 chamnan.t@b-connex.net
 *   node scripts/reset-password-hash.mjs 001
 *   (ถ้าไม่ใส่อีเมล จะได้แค่ hash ไป UPDATE เองใน Supabase)
 */
import bcrypt from 'bcrypt';

const password = process.argv[2] || '001';
const email = process.argv[3] || null;

const hash = await bcrypt.hash(password, 10);
console.log('\nรหัสผ่าน:', password);
console.log('Hash:', hash);

if (email) {
  const safeEmail = email.replace(/'/g, "''");
  console.log('\n--- คัดลอกไปรันใน Supabase → SQL Editor ---\n');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE LOWER(TRIM(email)) = '${safeEmail.toLowerCase()}';`);
  console.log('\n--- จบ ---\n');
} else {
  console.log('\nใส่อีเมลเป็นอาร์กิวเมนต์ที่ 3 เพื่อสร้างคำสั่ง SQL เต็ม');
  console.log('ตัวอย่าง: node scripts/reset-password-hash.mjs 001 chamnan.t@b-connex.net\n');
}
