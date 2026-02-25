-- ===================================
-- HR Leave Management System Schema
-- ===================================

-- ⚠️ WARNING: This will DROP all existing tables and data!
-- Drop existing tables (if any) และ dependencies
DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_attendance_updated_at ON attendance;
  DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON leave_requests;
  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  DROP FUNCTION IF EXISTS update_updated_at_column();
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore errors
END $$;

DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS leave_types CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'EMPLOYEE')),
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
  department VARCHAR(255),
  join_date DATE NOT NULL,
  manager_id VARCHAR(10),
  
  -- Leave quotas
  sick_quota INTEGER DEFAULT 0,
  personal_quota INTEGER DEFAULT 0,
  vacation_quota INTEGER DEFAULT 0,
  ordination_quota INTEGER DEFAULT 0,
  military_quota INTEGER DEFAULT 0,
  maternity_quota INTEGER DEFAULT 0,
  sterilization_quota INTEGER DEFAULT 0,
  paternity_quota INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Leave Types Table
CREATE TABLE IF NOT EXISTS leave_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL,
  applicable VARCHAR(10) NOT NULL CHECK (applicable IN ('male', 'female', 'both')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  user_name VARCHAR(255),
  type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  submitted_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(10),
  manager_comment TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_submitted_at ON leave_requests(submitted_at);

-- 4. Holidays Table
CREATE TABLE IF NOT EXISTS holidays (
  date DATE PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);

-- 5. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'leave')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- 6. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'request')),
  is_read BOOLEAN DEFAULT FALSE,
  link VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ===================================
-- Default Leave Types
-- ===================================
INSERT INTO leave_types (id, name, color, applicable) VALUES
  ('sick', 'ลาป่วย', '#ef4444', 'both'),
  ('personal', 'ลากิจ', '#f59e0b', 'both'),
  ('vacation', 'ลาพักร้อน', '#3b82f6', 'both'),
  ('ordination', 'ลาบวช', '#8b5cf6', 'male'),
  ('military', 'ลาเกณฑ์ทหาร', '#10b981', 'male'),
  ('maternity', 'ลาคลอด', '#ec4899', 'female'),
  ('sterilization', 'ลาทำหมัน', '#6366f1', 'female'),
  ('paternity', 'ลาเลี้ยงบุตร (ชาย)', '#06b6d4', 'male')
ON CONFLICT (id) DO NOTHING;

-- ===================================
-- Sample Holidays 2026
-- ===================================
INSERT INTO holidays (date, name) VALUES
  ('2026-01-01', 'วันขึ้นปีใหม่'),
  ('2026-02-16', 'วันมาฆบูชา'),
  ('2026-04-06', 'วันจักรี'),
  ('2026-04-13', 'วันสงกรานต์'),
  ('2026-04-14', 'วันสงกรานต์'),
  ('2026-04-15', 'วันสงกรานต์'),
  ('2026-05-01', 'วันแรงงานแห่งชาติ'),
  ('2026-05-05', 'วันฉัตรมงคล'),
  ('2026-05-13', 'วันวิสาขบูชา'),
  ('2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
  ('2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
  ('2026-08-12', 'วันแม่แห่งชาติ'),
  ('2026-10-13', 'วันคล้ายวันสวรรคตพระบาทสมเด็จพระปรมินทรมหาภูมิพลอดุลยเดช บรมนาถบพิตร'),
  ('2026-10-23', 'วันปิยมหาราช'),
  ('2026-12-05', 'วันพ่อแห่งชาติ'),
  ('2026-12-10', 'วันรัฐธรรมนูญ'),
  ('2026-12-31', 'วันสิ้นปี')
ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name;

-- ===================================
-- Triggers for updated_at
-- ===================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
