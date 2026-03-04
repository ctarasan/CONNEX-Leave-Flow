-- เก็บ IP และ User-Agent ของ device ที่ login ล่าสุด (เพื่อแสดงในข้อความแจ้งเตือนบน device เก่า)
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
