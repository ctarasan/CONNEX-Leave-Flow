/**
 * Seed Script: โหลดข้อมูลจาก CONNEX_Data.csv เข้า Supabase
 * 
 * วิธีใช้:
 *   npm run seed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csvParser from 'csv-parser';
import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';
import iconv from 'iconv-lite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// โหลด .env
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface CSVRow {
  ID: string;
  Name: string;
  StartDate: string;
  Position: string;
  Email: string;
  Under: string;
  Password: string;
}

// แปลงวันที่จาก d/m/YYYY (พ.ศ.) เป็น YYYY-MM-DD (ค.ศ.)
function parseThaiDate(dateStr: string): string {
  // รูปแบบ: "8/7/2547" (d/m/bbbb)
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return new Date().toISOString().split('T')[0];
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const yearBE = parseInt(parts[2], 10); // พ.ศ.
  const yearAD = yearBE - 543; // แปลงเป็น ค.ศ.
  
  // Format: YYYY-MM-DD
  return `${yearAD}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// กำหนดเพศจากคำนำหน้าชื่อ
function getGenderFromName(name: string): 'male' | 'female' {
  const nameTrimmed = name.trim();
  // คำนำหน้า: นาย=ชาย, นาง/นางสาว=หญิง
  if (nameTrimmed.startsWith('นาย')) return 'male';
  if (nameTrimmed.startsWith('นาง') || nameTrimmed.startsWith('นางสาว')) return 'female';
  // default ถ้าไม่ระบุ
  return 'male';
}

// กำหนด role จากตำแหน่ง
function getRoleFromPosition(position: string): 'ADMIN' | 'MANAGER' | 'EMPLOYEE' {
  const pos = position.toLowerCase();
  if (pos.includes('managing director')) return 'ADMIN';
  if (pos.includes('director') || pos.includes('manager')) return 'MANAGER';
  return 'EMPLOYEE';
}

// กำหนด quota เริ่มต้น (ตามเพศ)
function getInitialQuotas(gender: 'male' | 'female') {
  if (gender === 'male') {
    return {
      sick: 30,
      personal: 7,
      vacation: 10,
      ordination: 15,
      military: 60,
      maternity: 0,
      sterilization: 0,
      paternity: 15,
    };
  } else {
    return {
      sick: 30,
      personal: 7,
      vacation: 10,
      ordination: 0,
      military: 0,
      maternity: 98,
      sterilization: 60,
      paternity: 0,
    };
  }
}

async function seedUsers() {
  console.log('🌱 เริ่มต้น seed ข้อมูลจาก CONNEX_Data.csv...\n');

  const csvPath = path.resolve(__dirname, '../CONNEX_Data.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ ไม่พบไฟล์:', csvPath);
    process.exit(1);
  }

  const rows: CSVRow[] = [];

  // อ่าน CSV (ใช้ encoding windows-874 สำหรับภาษาไทยในระบบ Windows)
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(iconv.decodeStream('windows-874'))
      .pipe(csvParser())
      .on('data', (row: CSVRow) => {
        rows.push(row);
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });

  console.log(`📄 อ่านข้อมูลจาก CSV ได้ ${rows.length} รายการ\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      const id = row.ID.trim().padStart(3, '0'); // format: "001", "002"
      const name = row.Name.trim();
      const email = row.Email.trim();
      const position = row.Position.trim();
      const joinDate = parseThaiDate(row.StartDate);
      const gender = getGenderFromName(name);
      const role = getRoleFromPosition(position);
      const managerId = row.Under && row.Under.trim() !== '' && row.Under.trim() !== row.ID.trim() 
        ? row.Under.trim().padStart(3, '0') 
        : null;
      
      // Hash password (ใช้ ID แบบ zero-padded เป็น password เช่น "001", "002", "003")
      const plainPassword = id; // ใช้ ID ที่ padded แล้ว (001, 002, ...)
      const passwordHash = await bcrypt.hash(plainPassword, 10);

      // Quotas ตามเพศ
      const quotas = getInitialQuotas(gender);

      // Insert เข้า users table
      await pool.query(
        `INSERT INTO users (
          id, name, email, password_hash, role, gender, department, 
          join_date, manager_id,
          sick_quota, personal_quota, vacation_quota, ordination_quota,
          military_quota, maternity_quota, sterilization_quota, paternity_quota
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          gender = EXCLUDED.gender,
          department = EXCLUDED.department,
          join_date = EXCLUDED.join_date,
          manager_id = EXCLUDED.manager_id,
          sick_quota = EXCLUDED.sick_quota,
          personal_quota = EXCLUDED.personal_quota,
          vacation_quota = EXCLUDED.vacation_quota,
          ordination_quota = EXCLUDED.ordination_quota,
          military_quota = EXCLUDED.military_quota,
          maternity_quota = EXCLUDED.maternity_quota,
          sterilization_quota = EXCLUDED.sterilization_quota,
          paternity_quota = EXCLUDED.paternity_quota`,
        [
          id, name, email, passwordHash, role, gender, position,
          joinDate, managerId,
          quotas.sick, quotas.personal, quotas.vacation, quotas.ordination,
          quotas.military, quotas.maternity, quotas.sterilization, quotas.paternity
        ]
      );

      console.log(`✅ [${id}] ${name} (${email}) - ${role}`);
      successCount++;
    } catch (err) {
      console.error(`❌ [${row.ID}] ${row.Name}:`, (err as Error).message);
      errorCount++;
    }
  }

  console.log(`\n✅ Seed สำเร็จ: ${successCount} รายการ`);
  if (errorCount > 0) {
    console.log(`❌ Seed ล้มเหลว: ${errorCount} รายการ`);
  }

  await pool.end();
  process.exit(0);
}

// รันสคริปต์
seedUsers().catch((err) => {
  console.error('❌ เกิดข้อผิดพลาด:', err);
  process.exit(1);
});
