# คู่มือเชื่อมต่อ LeaveFlow Pro กับ PostgreSQL

แอปปัจจุบันเก็บข้อมูลใน **localStorage** (แยกตามเบราว์เซอร์) การเชื่อมต่อ PostgreSQL จะทำให้ข้อมูลอยู่ที่ฐานข้อมูลเดียวกัน ทุกเครื่องเห็นข้อมูลเดียวกัน

---

## 1. สถาปัตยกรรมที่แนะนำ

```
[ React Frontend (Vite) ]  ←→  [ Backend API (Node.js + Express) ]  ←→  [ PostgreSQL ]
        store.ts                    REST API + การตรวจสอบสิทธิ์              ตาราง users, leave_requests, ...
```

- **Frontend**: ยังใช้ `store.ts` ได้ แต่เปลี่ยนให้เรียก **API** แทนอ่าน/เขียน localStorage
- **Backend**: รับ HTTP request, เชื่อมต่อ PostgreSQL, คืน JSON
- **PostgreSQL**: เก็บ users, leave_types, leave_requests, notifications, attendance, holidays

---

## 2. โครงสร้างตาราง PostgreSQL (Schema)

สร้างฐานข้อมูลแล้วรัน SQL ด้านล่าง (หรือใช้ migration tool):

```sql
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

-- พนักงาน (รหัสผ่านควร hash ก่อนเก็บ — ใช้ bcrypt ฝั่ง backend)
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

-- Session (ถ้าใช้ session-based auth แทน JWT)
-- CREATE TABLE sessions (
--   id VARCHAR(100) PRIMARY KEY,
--   user_id VARCHAR(50) NOT NULL REFERENCES users(id),
--   expires_at TIMESTAMPTZ NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
```

---

## 3. Backend (Node.js + Express + pg)

### 3.1 สร้างโปรเจกต์ backend

ในโฟลเดอร์โปรเจกต์หรือโฟลเดอร์ใหม่ `server/`:

```bash
mkdir server && cd server
npm init -y
npm install express pg cors dotenv bcrypt
npm install -D typescript @types/node @types/express @types/pg @types/cors @types/bcrypt ts-node
npx tsc --init
```

### 3.2 ตัวแปรสภาพแวดล้อม

สร้างไฟล์ `server/.env` (อย่า commit ลง git):

```env
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/leaveflow_db
JWT_SECRET=your-super-secret-key-change-in-production
```

### 3.3 โครงสร้างโฟลเดอร์ backend แนะนำ

```
server/
├── .env
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # เปิด Express + CORS + routes
│   ├── db.ts             # สร้าง pool จาก pg
│   ├── auth.ts           # middleware ตรวจสอบ token/session
│   ├── routes/
│   │   ├── users.ts
│   │   ├── leaveTypes.ts
│   │   ├── leaveRequests.ts
│   │   ├── attendance.ts
│   │   ├── notifications.ts
│   │   └── holidays.ts
│   └── types.ts          # copy / แปลงจาก frontend types
```

### 3.4 ตัวอย่างการเชื่อมต่อ DB และ route พื้นฐาน

**src/db.ts**

```ts
import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

**src/index.ts**

```ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { usersRouter } from './routes/users.js';
import { leaveRequestsRouter } from './routes/leaveRequests.js';
// ... import routes อื่น

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/users', usersRouter);
app.use('/api/leave-requests', leaveRequestsRouter);
// app.use('/api/leave-types', leaveTypesRouter);
// app.use('/api/attendance', attendanceRouter);
// app.use('/api/notifications', notificationsRouter);
// app.use('/api/holidays', holidaysRouter);

app.get('/api/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
```

**ตัวอย่าง route คำขอลา (src/routes/leaveRequests.ts)**

```ts
import { Router } from 'express';
import { pool } from '../db.js';

export const leaveRequestsRouter = Router();

leaveRequestsRouter.get('/', async (req, res) => {
  try {
    const { userId, role } = req.query; // หรือจาก JWT/session
    let result;
    if (role === 'ADMIN') {
      result = await pool.query('SELECT * FROM leave_requests ORDER BY submitted_at DESC');
    } else if (userId) {
      result = await pool.query(
        'SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY submitted_at DESC',
        [userId]
      );
    } else {
      return res.status(400).json({ error: 'Missing userId or role' });
    }
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

leaveRequestsRouter.post('/', async (req, res) => {
  const { userId, userName, type, startDate, endDate, reason } = req.body;
  const id = `lr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  try {
    await pool.query(
      `INSERT INTO leave_requests (id, user_id, user_name, type, start_date, end_date, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
      [id, userId, userName, type, startDate, endDate, reason ?? '']
    );
    res.status(201).json({ id, status: 'PENDING' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

leaveRequestsRouter.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, managerComment, managerId } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    await pool.query(
      `UPDATE leave_requests SET status = $1, manager_comment = $2, reviewed_at = NOW()
       WHERE id = $3`,
      [status, managerComment ?? null, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
```

คุณต้องเพิ่ม logic ให้ **Manager เห็นเฉพาะคำขอของลูกทีม** (ใช้ `manager_id` ในตาราง users) และตรวจสอบสิทธิ์จาก token/session ใน middleware

---

## 4. Frontend: เปลี่ยนจาก localStorage เป็นเรียก API

### 4.1 สร้าง API client

สร้างไฟล์ `src/api.ts`:

```ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    credentials: 'include', // ถ้าใช้ cookie session
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  getLeaveRequests: () => request<LeaveRequest[]>('/leave-requests'),
  postLeaveRequest: (data: Omit<LeaveRequest, 'id'|'status'|'submittedAt'>) =>
    request<{ id: string }>('/leave-requests', { method: 'POST', body: JSON.stringify(data) }),
  patchLeaveRequestStatus: (id: string, status: string, managerComment: string, managerId: string) =>
    request(`/leave-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, managerComment, managerId }),
    }),
  getUsers: () => request<User[]>('/users'),
  // ... สร้าง method ให้ครบทุกฟังก์ชันใน store
};
```

(ต้อง import type `LeaveRequest`, `User` จาก `./types`)

### 4.2 ใช้ API ใน store

ใน `store.ts` มีสองแนวทาง:

- **แนวทาง 1 (แนะนำสำหรับเริ่มต้น):** สร้าง `store.api.ts` ที่ export ฟังก์ชันชื่อเดียวกับ `store.ts` แต่ข้างในเรียก `api.getLeaveRequests()` แทน localStorage แล้วให้แอปเลือกใช้ได้ด้วย env เช่น `VITE_USE_API=true` แล้วใน `store.ts`:
  - ถ้า `import.meta.env.VITE_USE_API === 'true'` ให้ re-export จาก `store.api.ts`
  - ไม่ใช่ให้ใช้โค้ด localStorage แบบเดิม
- **แนวทาง 2:** แก้ `store.ts` โดยตรง ให้ทุกฟังก์ชันเช็กก่อนว่ามี `VITE_API_URL` หรือไม่ ถ้ามีให้ `await api.xxx()` แล้ว return ผลจาก API ถ้าไม่มีให้ใช้ localStorage แบบเดิม

ตัวอย่าง (แนวทาง 2) ใน `getLeaveRequests`:

```ts
export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  if (import.meta.env.VITE_API_URL) {
    return api.getLeaveRequests();
  }
  const stored = localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS);
  // ... โค้ดเดิม
}
```

หมายเหตุ: พอเปลี่ยนเป็น async ฝั่งที่เรียก `getLeaveRequests()` ในแอป (เช่น `App.tsx`, `LeaveForm`) ต้องใช้ `await` หรือ `.then()` และอาจต้องจัดการ loading/error

---

## 5. ความปลอดภัย

- **รหัสผ่าน:** ฝั่ง backend ใช้ **bcrypt** hash ก่อน INSERT/UPDATE ใน `users` ไม่เก็บ plain text
- **Session / JWT:** หลัง login ให้ backend ส่ง JWT หรือ set cookie (session) แล้วทุก request ต่อไปส่ง token ใน header หรือ cookie
- **Environment:** ไม่ใส่ `DATABASE_URL` หรือ `JWT_SECRET` ใน frontend ใช้เฉพาะใน server
- **HTTPS:** ใน production ใช้ HTTPS ทั้ง frontend และ API

---

## 6. ขั้นตอนสรุป

| ลำดับ | งาน |
|-------|------|
| 1 | ติดตั้ง PostgreSQL, สร้าง database และรัน SQL สร้างตาราง |
| 2 | สร้างโปรเจกต์ backend (Express + pg) ในโฟลเดอร์ `server/` |
| 3 | เขียน routes ให้ครบ: users, leave_types, leave_requests, attendance, notifications, holidays |
| 4 | เพิ่ม login/register API และ hash รหัสผ่าน + ออก JWT/session |
| 5 | สร้าง `src/api.ts` ใน frontend และเพิ่ม `VITE_API_URL` ใน `.env` |
| 6 | แก้ `store.ts` (หรือสร้าง store.api.ts) ให้เรียก API เมื่อมี `VITE_API_URL` |
| 7 | แก้จุดที่เรียก store ให้รองรับ async (เช่น useEffect + state สำหรับ requests) |
| 8 | ทดสอบ flow: ล็อกอิน → ขอลา → อนุมัติ → ดูประวัติบนอีกเครื่อง/อีกเบราว์เซอร์ |

ถ้าต้องการให้ช่วยเขียนโค้ด backend เต็ม (ทุก route + auth) หรือเขียนเฉพาะส่วน `store` ให้เรียก API พร้อม fallback localStorage บอกได้เลยว่าต้องการส่วนไหนก่อน
