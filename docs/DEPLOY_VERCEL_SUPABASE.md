# Deploy LeaveFlow Pro บน Vercel + ฐานข้อมูล Supabase

คู่มือนี้สรุปขั้นตอนให้แอปรันบน **Vercel** เท่านั้น (ไม่ใช้ localhost) และใช้ฐานข้อมูล **PostgreSQL บน Supabase**

---

## สิ่งที่ต้องมีก่อนเริ่ม

- บัญชี [Vercel](https://vercel.com) และ repo โปรเจกต์เชื่อมแล้ว
- บัญชี [Supabase](https://supabase.com) และสร้างโปรเจกต์แล้ว
- รันสคริปต์สร้างตารางใน Supabase แล้ว (ดู `docs/SUPABASE_SETUP.md` และ `scripts/init-supabase.sql`)

---

## 1. Supabase — เตรียมฐานข้อมูล

1. ไปที่ **Supabase** → โปรเจกต์ของคุณ → **SQL Editor**
2. รันสคริปต์จาก **`scripts/init-supabase.sql`** (สร้างตาราง `users`, `leave_requests`, `leave_types`, `holidays` ฯลฯ)
3. ไปที่ **Project Settings** (ไอคอนฟันเฟือง) → **Database**
4. คัดลอก **Connection string** (แบบ URI) แล้วแทนที่ `[YOUR-PASSWORD]` ด้วยรหัสผ่าน Database ของโปรเจกต์  
   - ใช้พอร์ต **6543** (Connection pooler) จะเหมาะกับ serverless บน Vercel  
   - รูปแบบประมาณ:  
     `postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`  
   - ถ้ารหัสผ่านมีอักขระพิเศษ (`@`, `#`, `:`) ให้ encode: `@` → `%40`, `#` → `%23`, `:` → `%3A`

เก็บค่า Connection string ไว้ใช้ในขั้นตอนที่ 2

---

## 2. Vercel — โปรเจกต์ Backend (โฟลเดอร์ server)

1. ไปที่ **Vercel** → **Add New** → **Project** → เลือก repo เดิม
2. ตั้งค่าโปรเจกต์:
   - **Root Directory:** กด **Edit** → ใส่ **`server`** (ใช้โฟลเดอร์ `server` เป็น root ของโปรเจกต์นี้เท่านั้น)
   - **Framework Preset:** ไม่ต้องเลือกหรือใช้ Other
3. **Environment Variables** — กด **Add** แล้วเพิ่ม:

   | Name | Value | หมายเหตุ |
   |------|--------|----------|
   | `DATABASE_URL` | Connection string จาก Supabase (ขั้นตอนที่ 1) | ต้องใส่ให้ถูก พอร์ต 6543 แนะนำ |
   | `JWT_SECRET` | คีย์ยาวอย่างน้อย 32 ตัวอักษร | สร้างได้ด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

4. กด **Deploy** และรอ build จบ
5. หลัง deploy สำเร็จ ให้ **copy URL ของโปรเจกต์ Backend** (เช่น `https://leaveflow-api-xxx.vercel.app`) — **ไม่มี** `/api` ต่อท้าย

---

## 3. Vercel — โปรเจกต์ Frontend (แอปหลัก)

1. ไปที่ **Vercel** → เลือกโปรเจกต์ **Frontend** (โปรเจกต์ที่ Root Directory เป็น root ของ repo หรือว่าง)
2. **Environment Variables** — เพิ่ม:
   - **Name:** `VITE_API_URL`
   - **Value:** URL เต็มของ Backend จากขั้นตอนที่ 2 (เช่น `https://leaveflow-api-xxx.vercel.app`) — **ไม่มี** `/api` ต่อท้าย
3. **สำคัญ:** หลังเพิ่มหรือแก้ `VITE_API_URL` ต้อง **Redeploy** โปรเจกต์ Frontend ทุกครั้ง  
   - ไปที่ **Deployments** → deployment ล่าสุด → ⋮ → **Redeploy**

---

## 4. ตรวจสอบหลัง Deploy

1. **Backend**
   - เปิด `https://<backend-url>/api/health` → ควรได้ `{"ok":true,"message":"Backend is running"}`
   - เปิด `https://<backend-url>/api/status` → ควรได้ `"database": true` และข้อความเกี่ยวกับ Supabase

2. **Frontend**
   - เปิด URL แอป (เช่น `https://connex-leave-flow.vercel.app`)
   - ควรเห็นแถบสีฟ้า **"โหมด Supabase — ข้อมูลโหลดและบันทึกลงเซิร์ฟเวอร์"**
   - ล็อกอินด้วย user ที่มีใน Supabase (ตาราง `users`) แล้วทดสอบยื่นคำขอลา → ควรบันทึกลง Supabase

---

## สรุป Checklist

| ขั้นตอน | การกระทำ |
|---------|----------|
| 1 | Supabase: รัน `init-supabase.sql`, copy Connection string (พอร์ต 6543) |
| 2 | Vercel Backend: Root = `server`, ตั้ง `DATABASE_URL` + `JWT_SECRET` → Deploy → copy URL |
| 3 | Vercel Frontend: ตั้ง `VITE_API_URL` = URL Backend → **Redeploy** |
| 4 | เปิด `/api/status` ของ Backend ตรวจว่า `database: true` แล้วเปิดแอปตรวจแถบโหมด Supabase |

---

## แก้ปัญหา: ยังขึ้น "ติดต่อฐานข้อมูลไม่ได้" บน Vercel

### ขั้นที่ 1 — ดูข้อความในแอป

บนแถบแดงจะมี:
- **สาเหตุ:** บอกว่าเป็นปัญหา "Backend ไม่ตอบสนอง" หรือ "Backend ตอบแต่ฐานข้อมูลเชื่อมไม่ได้" หรือข้อความ error จากเซิร์ฟเวอร์
- **แอปกำลังเรียก: &lt;url&gt;/api/status** คือ URL ที่ Frontend ใช้เรียก Backend

### ขั้นที่ 2 — เช็ก Backend โดยตรง

เปิดในเบราว์เซอร์ (แทนที่ด้วย URL จริงของ Backend คุณ):

- `https://<backend-url>/api/health`  
  - ได้ `{"ok":true,...}` = Backend รันอยู่  
  - ไม่ขึ้น / error = Backend ไม่รัน หรือ URL ผิด

- `https://<backend-url>/api/status`  
  - ได้ `"database": true` = ต่อ Supabase ได้  
  - ได้ `"database": false` และมี `"message": "Backend is running but DB failed: ..."` = Backend รันแต่ต่อ DB ไม่ได้ → ดูข้อความหลัง "DB failed:" เพื่อไล่สาเหตุ

### ขั้นที่ 3 — เช็กตามสาเหตุ

| สาเหตุที่เห็น | สิ่งที่ต้องเช็ก |
|----------------|------------------|
| **Backend ไม่ตอบสนอง** / **Failed to fetch** | 1) URL ใน "แอปกำลังเรียก" ตรงกับ URL จริงของโปรเจกต์ Backend บน Vercel หรือไม่<br>2) โปรเจกต์ Frontend ตั้ง **VITE_API_URL** = URL นั้นแล้วหรือยัง และ **Redeploy Frontend** หลังตั้งค่าแล้วหรือยัง<br>3) เปิด `<backend-url>/api/health` ในเบราว์เซอร์ว่าได้ตอบกลับหรือไม่ |
| **Backend ตอบแต่ฐานข้อมูลเชื่อมไม่ได้** / **DB failed: ...** | 1) โปรเจกต์ **Backend** บน Vercel → **Settings** → **Environment Variables** มี **DATABASE_URL** และค่าตรงกับ Connection string จาก Supabase (พอร์ต **6543**, รหัสผ่านถูกต้อง, อักขระพิเศษ encode แล้ว)<br>2) Supabase → **Project Settings** → **Database** → ใช้ Connection string แบบ **URI** (Session pooler)<br>3) แก้ env แล้วให้ **Redeploy โปรเจกต์ Backend** |
| **DATABASE_URL is not set** | ใน Vercel โปรเจกต์ Backend ยังไม่มีตัวแปร **DATABASE_URL** → เพิ่มใน Environment Variables แล้ว Redeploy |

### ขั้นที่ 4 — Redeploy ให้ครบ

- แก้ **Environment Variables** ของ **Frontend** (เช่น VITE_API_URL) → ต้อง **Redeploy โปรเจกต์ Frontend**
- แก้ **Environment Variables** ของ **Backend** (เช่น DATABASE_URL, JWT_SECRET) → ต้อง **Redeploy โปรเจกต์ Backend**

---

ถ้าแอปยังขึ้น "ติดต่อฐานข้อมูลไม่ได้" ให้ดูข้อความ **สาเหตุ** และ **แอปกำลังเรียก: ...** บนแถบแดง แล้วทำตามขั้นที่ 2–4 ด้านบน
