-- หนึ่ง user ลงชื่อใช้ได้เพียง 1 device ในเวลาเดียวกัน
-- เก็บ session_id ล่าสุดของแต่ละ user; token เก่าจะไม่ตรงกับ session_id จึงได้ 401 SESSION_REPLACED
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id VARCHAR(10) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
