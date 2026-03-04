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
3. (ถ้าใช้ฟีเจอร์ **หนึ่ง user ต่อหนึ่ง device**) รัน **`server/migrations/003_user_sessions.sql`** เพื่อสร้างตาราง `user_sessions`
4. ไปที่ **Project Settings** (ไอคอนฟันเฟือง) → **Database**
5. คัดลอก **Connection string** (แบบ URI) แล้วแทนที่ `[YOUR-PASSWORD]` ด้วยรหัสผ่าน Database ของโปรเจกต์  
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
   | `OFFICE_IP_RANGES` | prefix IP ของเครือข่ายออฟฟิศ คั่นด้วย comma | เช่น `192.168.1.,10.0.0.` — **ถ้าไม่ตั้งค่า = ลงเวลาไม่ได้จากเครือข่ายใด** (ทำงานได้เฉพาะเมื่ออยู่ที่ออฟฟิศ) |

   วิธีหาและตั้งค่า **OFFICE_IP_RANGES** (สำหรับ WiFi Connex_fibre_2.4G) — ดูหัวข้อ **"ตั้ง OFFICE_IP_RANGES สำหรับลงเวลาเฉพาะที่ออฟฟิศ"** ด้านล่าง

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

## Push อัตโนมัติหลัง commit (ให้ Vercel deploy ทุกครั้งที่มีการแก้ไข)

ถ้าโปรเจกต์ Vercel ผูกกับ Git repo อยู่ การ **push** ขึ้น remote จะทำให้ Vercel build และ deploy ให้อัตโนมัติ

### วิธีที่ 1: ตั้งค่า Git hook (แนะนำ)

รันครั้งเดียวในโปรเจกต์:

```bash
npm run setup:push-hook
```

จากนั้นทุกครั้งที่คุณ **git commit** จะ **push ไป origin อัตโนมัติ** → Vercel จะ deploy ให้

### วิธีที่ 2: Push เองหลัง commit

ถ้าไม่ใช้ hook ให้ push เองหลัง commit:

```bash
npm run push
```

หรือ `git push origin master` (หรือ branch ที่ Vercel ดูอยู่ เช่น `main`)

---

## ตั้ง OFFICE_IP_RANGES สำหรับลงเวลาเฉพาะที่ออฟฟิศ (WiFi Connex_fibre_2.4G)

ลงเวลาได้เฉพาะเมื่ออุปกรณ์เชื่อมต่อ **WiFi บริษัท Connex_fibre_2.4G** ที่ออฟฟิศ ระบบตรวจจาก **IP ที่ Backend (Vercel) เห็น** เมื่อมี request เข้ามา

**สำคัญ:** เมื่อคุณเปิดแอปจากเบราว์เซอร์ request ไปที่ Vercel จะออกผ่าน **เราเตอร์ออฟฟิศ** ดังนั้น Vercel จะเห็นเป็น **IP สาธารณะ (public) ของออฟฟิศ** (เช่น 203.xxx.xxx.xxx) **ไม่ใช่** IP ภายในเช่น 192.168.0.136 — จึงต้องตั้ง **OFFICE_IP_RANGES เป็น IP สาธารณะของออฟฟิศ** (หรือช่วงของมัน)

### ขั้นที่ 1 — หา IP สาธารณะของออฟฟิศ

1. นำโน้ตบุ๊ก/มือถือไปที่ออฟฟิศ แล้วเชื่อมต่อ **WiFi "Connex_fibre_2.4G"**
2. เปิดเบราว์เซอร์ แล้วเข้าเว็บเช็ก IP สาธารณะ เช่น **https://whatismyip.com** หรือ **https://api.ipify.org** — ตัวเลขที่ได้ (เช่น 203.150.12.34) คือ **IP สาธารณะของออฟฟิศ** ที่ Vercel จะเห็น
3. ใช้ตัวเลขนี้เป็นค่า OFFICE_IP_RANGES:
   - ถ้า IP สาธารณะคงที่: ใส่เต็ม เช่น **`203.150.12.34`**
   - ถ้า ISP อาจเปลี่ยนเลขท้าย: ใช้ prefix เช่น **`203.150.12.`**

### ขั้นที่ 2 — ใส่ค่าใน Vercel

1. ไปที่ **Vercel** → เลือกโปรเจกต์ **Backend** (เช่น connex-leave-flow-doak)
2. ไปที่ **Settings** → **Environment Variables**
3. กด **Add New** (หรือแก้ตัวแปรเดิมถ้ามีแล้ว):
   - **Name:** `OFFICE_IP_RANGES`
   - **Value:** ใส่ **IP สาธารณะของออฟฟิศ** จากขั้นที่ 1  
     - IP คงที่: เช่น `203.150.12.34`  
     - หลายค่า (คั่นด้วย comma): เช่น `203.150.12.34,203.150.12.35` หรือ prefix `203.150.12.`
4. เลือก **Environment** ตามที่ใช้ (Production / Preview ฯลฯ) แล้วกด **Save**

### ขั้นที่ 3 — Redeploy Backend

ไปที่ **Deployments** → deployment ล่าสุด → เมนู ⋮ → **Redeploy**  
หลัง deploy เสร็จ การลงเวลาจะผ่านเฉพาะเมื่ออุปกรณ์ใช้ IP ที่ขึ้นต้นตามที่ตั้งไว้ (即 เมื่อเชื่อมต่อ WiFi ออฟฟิศ)

### ตัวอย่างค่า OFFICE_IP_RANGES (ต้องเป็น IP สาธารณะของออฟฟิศ)

| สถานการณ์ | ค่า Value |
|-----------|-----------|
| ออฟฟิศมี IP สาธารณะคงที่ (เช่น 203.150.12.34) | `203.150.12.34` |
| อยากให้รองรับหลาย IP (เช่น 203.150.12.34 และ .35) | `203.150.12.34,203.150.12.35` |
| ใช้ prefix เพื่อรองรับการเปลี่ยนเลขท้าย | `203.150.12.` |

**หมายเหตุ:** อย่าใช้ IP ภายใน (192.168.x.x, 10.x.x.x) — เมื่อเปิดแอปบน Vercel เซิร์ฟเวอร์จะเห็นแต่ IP สาธารณะของเราเตอร์ออฟฟิศเท่านั้น

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
| **ENOTFOUND db.xxx.supabase.co** | ใช้ **Connection pooler** แทน Direct: ใน Supabase → **Project Settings** → **Database** เลือก **Connection string** แบบ **URI** ที่โฮสต์เป็น **`aws-0-[region].pooler.supabase.com`** และพอร์ต **6543** (ห้ามใช้ `db.xxx.supabase.co` บน Vercel — จะ resolve ไม่ได้). ใส่ค่าใหม่ใน **DATABASE_URL** ของ Backend แล้ว Redeploy Backend |
| **DATABASE_URL is not set** | ใน Vercel โปรเจกต์ Backend ยังไม่มีตัวแปร **DATABASE_URL** → เพิ่มใน Environment Variables แล้ว Redeploy |
| **password authentication failed for user "postgres"** | ดูหัวข้อด้านล่าง "รหัสผ่านตรงแล้วแต่ยังต่อไม่ได้" |
| **Connection terminated unexpectedly** | ลองใช้ **Transaction** (พอร์ต **6543**) แทน Session pooler (5432): ใน Supabase → Connect → Method เลือก **Transaction** แล้ว copy connection string ไปใส่ใน **DATABASE_URL** (โฮสต์เดิม pooler แต่พอร์ต 6543). จากนั้น Redeploy Backend. ถ้ายังไม่ได้ เช็กว่าไม่มี space/newline ใน DATABASE_URL และ Redeploy อีกครั้ง |

### รหัสผ่านใน Supabase กับ DATABASE_URL ตรงกันแล้ว แต่ยังต่อ DB ไม่ได้ — ตรวจรายการนี้

| ลำดับ | ตรวจสอบ | รายละเอียด |
|--------|----------|-------------|
| 1 | **Redeploy Backend หลังแก้ env** | บน Vercel ตัวแปร Environment ถูกอ่านตอน **Deploy** เท่านั้น — หลังแก้ **DATABASE_URL** ต้องไปที่ **Deployments** → deployment ล่าสุด → ⋮ → **Redeploy** โปรเจกต์ Backend จริง |
| 2 | **Scope ของ Environment Variable** | ใน Vercel → Backend → **Settings** → **Environment Variables** ดูว่า **DATABASE_URL** ถูกตั้งสำหรับ **Production** (และถ้าใช้ Preview ให้ตั้งสำหรับ Preview ด้วย) — deployment ที่รันอาจใช้ scope ที่ยังไม่มีค่า |
| 3 | **ไม่มีช่องว่างหรือตัวขึ้นบรรทัดใน DATABASE_URL** | ตอน paste connection string ลงใน Vercel ต้องไม่มี **space** ด้านหน้า/ด้านหลัง และไม่มี **newline** — ลองลบแล้ว paste ใหม่เฉพาะบรรทัดเดียว |
| 4 | **รหัสผ่านมีอักขระพิเศษ → ต้อง encode** | ถ้ารหัสผ่านมี `@ # $ : /` ฯลฯ ต้องแปลงก่อนใส่ใน URL: `@`→`%40`, `#`→`%23`, `$`→`%24`, `:`→`%3A`, `/`→`%2F` — ถ้าไม่ encode จะทำให้ parse URL ผิดและ authentication fail |
| 5 | **รูปแบบ username ใน URL** | ต้องเป็น **`postgres.[project-ref]`** (เช่น `postgres.cawktiitkxxnxaefnkto`) ไม่ใช่แค่ `postgres` — ดูจาก connection string ใน Supabase ว่าใช้รูปแบบนี้ |
| 6 | **โฮสต์และพอร์ตตรงกับ Supabase** | ใช้ connection string แบบ **Session pooler** หรือ **Transaction** ที่ Supabase แสดง (โฮสต์ `aws-0-...` หรือ `aws-1-...pooler.supabase.com`, พอร์ต 5432 หรือ 6543 ตามที่ Supabase บอก) — ไม่ผสมระหว่าง Direct กับ pooler |
| 7 | **โปรเจกต์ Supabase ไม่ถูก Pause** | ใน Supabase → **Project Settings** → **General** → **Project availability** ตรวจว่าโปรเจกต์ **ไม่ได้ถูก Pause** — ถ้า Pause อยู่ให้กด Restore |
| 8 | **โปรเจกต์เดียวกัน** | ค่า **project-ref** ใน DATABASE_URL (เช่น `cawktiitkxxnxaefnkto`) ต้องตรงกับโปรเจกต์ที่คุณ reset password และดูอยู่บน Supabase |
| 9 | **ดู error จริงจาก Vercel Logs** | ใน Vercel → โปรเจกต์ Backend → **Logs** (หรือ **Deployments** → คลิก deployment → **Functions** → เลือก function ที่รัน `/api/status`) ดู error message จริงจาก runtime — บางครั้งมีรายละเอียดมากกว่าแอป (เช่น connection timeout, SSL error) |

### ขั้นที่ 4 — Redeploy ให้ครบ

- แก้ **Environment Variables** ของ **Frontend** (เช่น VITE_API_URL) → ต้อง **Redeploy โปรเจกต์ Frontend**
- แก้ **Environment Variables** ของ **Backend** (เช่น DATABASE_URL, JWT_SECRET) → ต้อง **Redeploy โปรเจกต์ Backend**

---

ถ้าแอปยังขึ้น "ติดต่อฐานข้อมูลไม่ได้" ให้ดูข้อความ **สาเหตุ** และ **แอปกำลังเรียก: ...** บนแถบแดง แล้วทำตามขั้นที่ 2–4 ด้านบน
