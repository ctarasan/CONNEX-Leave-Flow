/**
 * Migration Script: สร้าง database schema ใน Supabase
 * 
 * วิธีใช้:
 *   npm run migrate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// โหลด .env
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  console.log('🔨 เริ่มต้น migration...\n');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ เชื่อมต่อ database สำเร็จ\n');

    // อ่านไฟล์ migration
    const migrationPath = path.resolve(__dirname, 'migrations', '001_create_tables.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ ไม่พบไฟล์ migration:', migrationPath);
      process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 กำลังรัน migration: 001_create_tables.sql');
    await pool.query(sql);
    console.log('✅ Migration สำเร็จ!\n');

    console.log('✨ สร้าง tables ครบถ้วน:');
    console.log('   - users');
    console.log('   - leave_types');
    console.log('   - leave_requests');
    console.log('   - holidays');
    console.log('   - attendance');
    console.log('   - notifications');
    console.log('\n📦 เพิ่มข้อมูลตั้งต้น:');
    console.log('   - 8 ประเภทการลา');
    console.log('   - วันหยุดนักขัตฤกษ์ 2026\n');

  } catch (err) {
    console.error('❌ Migration ล้มเหลว:', (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// รันสคริปต์
runMigrations();
