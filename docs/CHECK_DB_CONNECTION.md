# วิธีตรวจสอบว่า App ติดต่อกับ DB (Supabase) เรียบร้อย

**ถ้า deploy บน Vercel และรหัสผ่านใน DATABASE_URL ตรงกับ Supabase แล้วแต่ยังต่อไม่ได้** → ดูรายการตรวจสอบแบบละเอียดใน **`docs/DEPLOY_VERCEL_SUPABASE.md`** หัวข้อ **"รหัสผ่านใน Supabase กับ DATABASE_URL ตรงกันแล้ว แต่ยังต่อ DB ไม่ได้"**

---

## อยู่ๆ ติดต่อฐานข้อมูลไม่ได้ — ดูสาเหตุจริงที่ไหน

1. **บนหน้า Login (แถบแดง)**  
   ใต้ข้อความ "ติดต่อฐานข้อมูลไม่ได้" จะมีบรรทัด **"สาเหตุ: ..."** — อ่านข้อความนั้น (เช่น `Backend is running but DB failed: password authentication failed` หรือ `ENOTFOUND`)

2. **เปิด URL โดยตรงในเบราว์เซอร์**  
   - รันบนเครื่อง: เปิด **http://localhost:3002/api/status** (ใช้พอร์ตตามที่ Backend รัน เช่น 3002)  
   - Deploy บน Vercel: เปิด **https://&lt;backend-url&gt;/api/status**  
   จะได้ JSON เช่น `{"server":true,"database":false,"message":"Backend is running but DB failed: ..."}` — ข้อความหลัง **DB failed:** คือสาเหตุจริง

3. **รัน Backend บนเครื่องแล้วดูเทอร์มินัล**  
   `cd server` แล้ว `npm run dev` — ถ้าต่อ DB ไม่ได้จะขึ้น `[ERROR] Database connection failed: <ข้อความ error>`

### สาเหตุที่พบบ่อยเมื่อ “อยู่ๆ ต่อไม่ได้”

| สาเหตุ | วิธีเช็ก/แก้ |
|--------|----------------|
| **Supabase โปรเจกต์ถูก Pause** (ฟรี tier ถูกพักหลังไม่ใช้หลายวัน) | Supabase → Project Settings → General → **Project availability** → กด **Restore** |
| **Backend ไม่ได้รัน** (รันบนเครื่อง) | ในโฟลเดอร์ `server` รัน `npm run dev` แล้วรีเฟรชแอป |
| **ไม่มีไฟล์ `server/.env` หรือไม่มี DATABASE_URL** | คัดลอกจาก `server/.env.example` เป็น `server/.env` แล้วใส่ค่า DATABASE_URL จริงจาก Supabase |
| **รหัสผ่าน DB ถูกเปลี่ยนใน Supabase** | ไปที่ Supabase → Project Settings → Database → Reset password แล้วอัปเดตค่าใน `server/.env` (หรือ Vercel env) แล้วรัน Backend ใหม่ / Redeploy |
| **Deploy บน Vercel แต่ยังไม่ Redeploy หลังแก้ env** | แก้ Environment Variables แล้วต้องไป Deployments → Redeploy โปรเจกต์ Backend |
| **ใช้โฮสต์ Direct (db.xxx.supabase.co) บน Vercel** | ใช้ Connection string แบบ **Session pooler** (โฮสต์ `aws-0-...pooler.supabase.com`, พอร์ต 6543) — ดู `docs/DEPLOY_VERCEL_SUPABASE.md` |
| **SASL authentication failed** (รัน `npx tsx src/test-db.ts` แล้วขึ้นแบบนี้) | มักเป็น (1) **โปรเจกต์ Supabase ถูก Pause** → ไปเช็กและกด Restore ก่อน (2) หรือรหัสผ่านใน `DATABASE_URL` ไม่ตรงกับ Supabase → ดูหัวข้อ **"แก้ SASL authentication failed"** |

### แก้ SASL authentication failed

ข้อความนี้แปลว่า **ล็อกอินเข้า PostgreSQL ถูกปฏิเสธ**  

**ถ้าเมื่อไม่นานนี้ยังใช้ได้อยู่และไม่ได้แก้รหัสผ่าน:** ให้เช็กก่อนว่าโปรเจกต์ Supabase **ถูก Pause** หรือไม่  
→ เปิด Supabase → เลือกโปรเจกต์ → **Project Settings** → **General** → **Project availability**  
ถ้าขึ้นว่า Paused / Inactive ให้กด **Restore** รอสักครู่แล้วลองรัน `npx tsx src/test-db.ts` อีกครั้ง  

ถ้าไม่ได้ Pause หรือ Restore แล้วยังขึ้น SASL อยู่ แก้ตามด้านล่าง:

1. **เอารหัสผ่าน DB ล่าสุดจาก Supabase**  
   - เปิด [Supabase](https://supabase.com) → โปรเจกต์ของคุณ  
   - **Project Settings** → **Database**  
   - ที่ **Database password** ถ้าจำไม่ได้ให้กด **Reset database password** แล้วตั้งรหัสผ่านใหม่ (เก็บไว้ใช้ในขั้นถัดไป)

2. **อัปเดต `server/.env`**  
   - เปิดไฟล์ `server/.env`  
   - แก้ `DATABASE_URL` ให้ใช้รหัสผ่านที่ตรงกับ Supabase  
   - ถ้ารหัสผ่านมี **อักขระพิเศษ** (`@`, `#`, `:`, `/`, `%` ฯลฯ) ต้อง **encode** ก่อนใส่ใน URL:
     - `@` → `%40`
     - `#` → `%23`
     - `:` → `%3A`
     - `/` → `%2F`
     - `%` → `%25`

3. **ใช้ Connection string จาก Supabase โดยตรง (แนะนำ)**  
   - ใน Supabase → **Project Settings** → **Database**  
   - หัวข้อ **Connection string** เลือกแบบ **URI**  
   - เลือกโหมด **Session** หรือ **Transaction** (พอร์ต 5432 หรือ 6543)  
   - กด **Copy** แล้ววางทั้งเส้นลงใน `DATABASE_URL` ใน `server/.env` (แทนที่รหัสผ่าน `[YOUR-PASSWORD]` ใน URL ด้วยรหัสผ่านจริง ถ้ามีอักขระพิเศษให้ encode ตามข้อ 2)

4. **ทดสอบอีกครั้ง**  
   ```bash
   cd server
   npx tsx src/test-db.ts
   ```  
   ถ้าสำเร็จจะขึ้น `[OK] Database connected.`

### ยังคงขึ้น "ติดต่อฐานข้อมูลไม่ได้" — เช็กรายการนี้

1. **มีไฟล์ `server/.env` หรือไม่** — ถ้าไม่มี ให้คัดลอก `server/.env.example` เป็น `server/.env` แล้วแก้ค่า
2. **ใน `server/.env`** — `DATABASE_URL` ต้องเป็นบรรทัดเดียว ไม่มีช่องว่างหน้า/หลัง ไม่มีเครื่องหมายคำพูดรอบค่า
3. **ใช้ Connection string แบบ Session Pooler** — โฮสต์ `aws-0-xxx.pooler.supabase.com`, Username `postgres.xxxxx`, พอร์ต 6543 (ใน Supabase → Database → Connect → Method: **Session** → Copy URI)
4. **รหัสผ่าน** — ถ้ายัง SASL: Reset database password ใน Supabase เป็นตัวอักษร+ตัวเลขอย่างเดียว แล้วใส่รหัสใหม่ใน URI ใน `.env`
5. **ตรวจรูปแบบ** — รัน `cd server` แล้ว `npx tsx src/check-db-url.ts` ดูโฮสต์เป็น pooler และ Username เป็น postgres.xxx

---

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
