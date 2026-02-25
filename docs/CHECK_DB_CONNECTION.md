# วิธีตรวจสอบว่า App ติดต่อกับ DB (Supabase) เรียบร้อย

## 1. ตรวจว่า Backend ต่อ DB ได้

### วิธีที่ 1: ดูตอนรัน Backend

รัน backend:

```bash
cd server
npm run dev
```

- ถ้าเห็นข้อความ **`[OK] Database connected`** ในเทอร์มินัล = Backend ต่อ Supabase ได้
- ถ้าเห็น **`[ERROR] Database connection failed`** = ยังต่อไม่ได้ (ตรวจรหัสผ่านหรือใช้ Connection pooler)

### วิธีที่ 2: เปิดในเบราว์เซอร์

เมื่อ backend รันอยู่ เปิดลิงก์นี้:

- **http://localhost:3001/api/health**  
  → ควรได้ `{"ok":true,"message":"Backend is running"}`

- **http://localhost:3001/api/health/db**  
  → ถ้าต่อ DB ได้จะได้ `{"ok":true,"message":"Database connected"}`  
  → ถ้าไม่ได้จะได้ `{"ok":false,"message":"Database error: ..."}`

### วิธีที่ 3: รันสคริปต์ทดสอบ (ไม่ต้องรัน server)

```bash
cd server
npx tsx src/test-db.ts
```

- สำเร็จ: ขึ้น `[OK] Database connected.`
- ไม่สำเร็จ: ขึ้น `[ERROR] ...`

---

## 2. รู้ได้ยังไงว่า “แอปใช้งาน DB บน Supabase จริง”

- **ตอนนี้:** Backend มีแค่ endpoint ตรวจสุขภาพ (`/api/health`, `/api/health/db`)  
  ยังไม่มี API สำหรับล็อกอิน / คำขอลา / ลงเวลา ฯลฯ  
  แอปฝั่งผู้ใช้ยังอ่าน/เขียนจาก **localStorage** อยู่  
  → ถ้า Backend ต่อ DB ได้ = **“ต่อ DB เรียบร้อย”** แต่ **“แอปยังไม่ได้ใช้ข้อมูลจาก Supabase”**

- **เมื่อพัฒนา API ครบแล้ว:**  
  จะมี API เช่น ล็อกอิน, ดึงรายการลา, บันทึกการลงเวลา ฯลฯ  
  และ Frontend ต้องตั้งค่า `VITE_API_URL=http://localhost:3001` แล้วให้ store ไปเรียก API แทน localStorage  
  → ถึงตอนนั้น ถ้าเปิดแอปแล้วล็อกอินได้ / เห็นข้อมูลจาก DB = **“แอปติดต่อกับ DB เรียบร้อย และใช้งาน DB บน Supabase แล้ว”**

---

## 3. ตรวจใน Supabase ว่ามีข้อมูลไหม

หลังมี API และแอปเรียก API จริงแล้ว:

1. เปิด **Supabase Dashboard** → โปรเจกต์ของคุณ
2. ไปที่ **Table Editor**
3. ดูตาราง `users`, `leave_requests`, `attendance_records` ฯลฯ ว่ามีแถวเพิ่ม/เปลี่ยนตามการใช้งานแอป

ถ้ามีการ INSERT/UPDATE ตรงกับที่ทำในแอป = แอปใช้งาน DB บน Supabase เรียบร้อยแล้ว

---

## 4. ให้คำขอลาไปที่ตาราง leave_requests (Supabase)

1. **ต้องมี user ในตาราง `users`**  
   คำขอลามี FK ไปที่ `users(id)` ดังนั้นก่อนยื่นลาจากแอป ต้องมีผู้ใช้ใน DB แล้ว  
   - **วิธีที่ 1:** เรียก `POST http://localhost:3002/api/users` (เมื่อ Backend รันอยู่) ส่ง body JSON เช่น  
     `{"id":"001","name":"ชื่อ-นามสกุล","email":"user@example.com","password":"รหัสผ่าน","role":"ADMIN","gender":"male","department":"แผนก","joinDate":"2024-01-01"}`  
     (รหัสผ่านจะถูก hash ให้อัตโนมัติ)  
   - **วิธีที่ 2:** สร้างผ่าน Supabase SQL Editor (ต้อง hash รหัสผ่านด้วย bcrypt เอง)

2. **ตั้งค่า Frontend ให้เรียก API**  
   - สร้างหรือแก้ไฟล์ **`.env` หรือ `.env.local`** ที่โฟลเดอร์หลักโปรเจกต์ (ระดับเดียวกับ `package.json`)
   - เพิ่มบรรทัด: **`VITE_API_URL=http://localhost:3002`**  
     (ถ้า Backend รันพอร์ตอื่น ให้ใช้พอร์ตนั้น)

3. **รัน Backend**  
   - `cd server` แล้ว `npm run dev`  
   - ต้องขึ้น `[OK] Database connected`

4. **รันแอปแล้วยื่นลา**  
   - ล็อกอินด้วย user ที่มีอยู่ในตาราง `users`  
   - ยื่นคำขอลา → ระบบจะส่งไปยัง Backend และ INSERT ลงตาราง `leave_requests`  
   - เปิด Supabase → Table Editor → `leave_requests` จะเห็นแถวใหม่
