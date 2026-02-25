-- ============================================================
-- LeaveFlow Pro - สคริปต์สร้างฐานข้อมูล PostgreSQL สำหรับ AWS RDS
-- ============================================================
-- วิธีใช้:
--   1. สร้าง RDS PostgreSQL instance บน AWS (แนะนำ PostgreSQL 14+)
--   2. สร้าง database ชื่อ leaveflow_db (หรือชื่อที่ต้องการ)
--   3. รันสคริปต์นี้ด้วย psql หรือ pgAdmin:
--      psql -h YOUR_RDS_ENDPOINT -U postgres -d leaveflow_db -f init-postgres-aws.sql
-- ============================================================

-- ถ้ามี schema เดิม ให้ drop (ระวัง: จะลบข้อมูลทั้งหมด)
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS attendance_records CASCADE;
-- DROP TABLE IF EXISTS leave_requests CASCADE;
-- DROP TABLE IF EXISTS holidays CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS leave_types CASCADE;
-- DROP TYPE IF EXISTS leave_status CASCADE;
-- DROP TYPE IF EXISTS applicable_to CASCADE;
-- DROP TYPE IF EXISTS gender_type CASCADE;
-- DROP TYPE IF EXISTS user_role CASCADE;

-- สร้าง enum ให้ตรงกับ types ในแอป
CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');
CREATE TYPE gender_type AS ENUM ('male', 'female');
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE applicable_to AS ENUM ('male', 'female', 'both');

-- ประเภทวันลา
CREATE TABLE leave_types (
  id VARCHAR(50) PRIMARY KEY,
  label VARCHAR(200) NOT NULL,
  applicable_to applicable_to NOT NULL DEFAULT 'both',
  default_quota NUMERIC(10,2) NOT NULL DEFAULT 0,
  "order" INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- พนักงาน (ใช้ password_hash — hash ด้วย bcrypt ฝั่ง backend ก่อน INSERT)
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'EMPLOYEE',
  gender gender_type NOT NULL,
  department VARCHAR(200) NOT NULL DEFAULT '',
  join_date DATE NOT NULL,
  manager_id VARCHAR(50) REFERENCES users(id),
  quotas JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_manager_id ON users(manager_id);
CREATE INDEX idx_users_email ON users(email);

-- คำขอลา
CREATE TABLE leave_requests (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES users(id),
  user_name VARCHAR(300) NOT NULL,
  type VARCHAR(50) NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status leave_status NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  manager_comment VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_start_date ON leave_requests(start_date);

-- การลงเวลา
CREATE TABLE attendance_records (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  is_late BOOLEAN NOT NULL DEFAULT false,
  penalty_applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_attendance_user_date ON attendance_records(user_id, date);

-- การแจ้งเตือน
CREATE TABLE notifications (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);

-- วันหยุดบริษัท (date = YYYY-MM-DD)
CREATE TABLE holidays (
  date DATE PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ข้อมูลเริ่มต้น (Seed)
-- ============================================================

-- ประเภทวันลา
INSERT INTO leave_types (id, label, applicable_to, default_quota, "order", is_active) VALUES
  ('SICK', 'ลาป่วย', 'both', 30, 1, true),
  ('VACATION', 'ลาพักร้อน', 'both', 12, 2, true),
  ('PERSONAL', 'ลากิจ', 'both', 3, 3, true),
  ('MATERNITY', 'ลาคลอด', 'female', 90, 4, true),
  ('STERILIZATION', 'ลาทำหมัน', 'both', 999, 5, true),
  ('OTHER', 'ลาอื่นๆ', 'both', 0, 6, true);

-- วันหยุดบริษัท 2569
INSERT INTO holidays (date, name) VALUES
  ('2026-01-01', 'วันขึ้นปีใหม่'),
  ('2026-03-03', 'วันมาฆบูชา'),
  ('2026-04-06', 'วันจักรี'),
  ('2026-04-13', 'วันสงกรานต์'),
  ('2026-04-14', 'วันสงกรานต์'),
  ('2026-04-15', 'วันสงกรานต์'),
  ('2026-05-01', 'วันแรงงานแห่งชาติ'),
  ('2026-05-04', 'วันฉัตรมงคล'),
  ('2026-06-01', 'ชดเชยวันวิสาขบูชา'),
  ('2026-06-03', 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสุทิดาฯ'),
  ('2026-07-28', 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว'),
  ('2026-07-29', 'วันอาสาฬหบูชา'),
  ('2026-08-12', 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสิริกิติ์ฯ และวันแม่แห่งชาติ'),
  ('2026-10-13', 'วันนวมินทรมหาราช'),
  ('2026-10-23', 'วันปิยมหาราช'),
  ('2026-12-07', 'ชดเชยวันพ่อแห่งชาติ'),
  ('2026-12-10', 'วันรัฐธรรมนูญ'),
  ('2026-12-31', 'วันสิ้นปี');

-- หมายเหตุ: users ให้สร้างผ่าน Backend API หลังลงทะเบียน/import
-- รหัสผ่านต้อง hash ด้วย bcrypt ก่อน INSERT
