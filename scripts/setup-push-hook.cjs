/**
 * คัดลอก post-commit.sample ไปที่ .git/hooks/post-commit
 * หลัง commit ทุกครั้งจะ push อัตโนมัติ → Vercel deploy
 * รัน: npm run setup:push-hook
 */
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, 'git-hooks', 'post-commit.sample');
const to = path.join(__dirname, '..', '.git', 'hooks', 'post-commit');

if (!fs.existsSync(path.join(__dirname, '..', '.git'))) {
  console.error('ไม่พบโฟลเดอร์ .git');
  process.exit(1);
}

fs.copyFileSync(from, to);
console.log('ตั้งค่าแล้ว: .git/hooks/post-commit');
console.log('จากนี้หลัง git commit จะ push ไป origin อัตโนมัติ (ถ้า Vercel ผูก repo อยู่ จะ deploy ให้)');
