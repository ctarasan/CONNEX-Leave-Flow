# เช็กการตั้งค่า: ให้ Frontend ส่งข้อมูลไป Supabase (ไม่ใช้แค่ local memory)

แอปจะใช้ **local memory (localStorage)** เท่านั้น จนกว่าจะตั้งค่าให้เชื่อม **Backend** แล้ว **Build ใหม่** จึงจะส่งข้อมูลไป Supabase ได้

---

## 1. Configuration ที่ต้องดู (เรียงตามลำดับ)

### A. โปรเจกต์ Frontend บน Vercel (connex-leave-flow)

| สิ่งที่เช็ก | วิธีดู | ค่าที่ถูกต้อง |
|-------------|--------|----------------|
| **Environment Variable: VITE_API_URL** | Vercel → เลือก **โปรเจกต์ Frontend** (ไม่ใช่ Backend) → **Settings** → **Environment Variables** | ต้องมีตัวแปรชื่อ **`VITE_API_URL`** และ Value = URL เต็มของ Backend เช่น `https://your-backend.vercel.app` (**ไม่มี** `/api` ต่อท้าย) |
| **Redeploy หลังตั้งค่า** | Deployments → deployment ล่าสุด → ⋮ → **Redeploy** | หลังเพิ่มหรือแก้ **VITE_API_URL** ต้อง Redeploy **ทุกครั้ง** เพราะ Vite ใส่ค่า env ตอน build เท่านั้น |

ถ้าไม่มี `VITE_API_URL` หรือมีแต่ยังไม่เคย Redeploy หลังตั้งค่า → แอปที่รันอยู่จะยังเป็นโหมด local อยู่

---

### B. โปรเจกต์ Backend บน Vercel (โปรเจกต์ที่ deploy โฟลเดอร์ `server`)

| สิ่งที่เช็ก | วิธีดู | ค่าที่ถูกต้อง |
|-------------|--------|----------------|
| **Root Directory** | Vercel → โปรเจกต์ Backend → **Settings** → **General** | ต้องเป็น **`server`** |
| **Environment Variable: DATABASE_URL** | Settings → **Environment Variables** | Connection string ของ Supabase (Postgres) จาก Supabase → Project Settings → Database |
| **Environment Variable: JWT_SECRET** | Settings → **Environment Variables** | คีย์ยาวๆ สำหรับ sign JWT (สร้างด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |

---

### C. Supabase

| สิ่งที่เช็ก | วิธีดู |
|-------------|--------|
| **ตารางมีอยู่** | Table Editor มีตาราง `users`, `leave_requests`, `leave_types`, `holidays` (ตามที่ Backend ใช้) |
| **Connection string ตรงกับ Backend** | ค่า **DATABASE_URL** ใน Backend ต้องชี้ไปที่โปรเจกต์ Supabase เดียวกับที่คุณเปิดดู Table Editor |

---

## 2. วิธีเช็กว่าแอปเชื่อม Backend หรือยัง (จากฝั่งผู้ใช้)

- **หน้า Login (ก่อนล็อกอิน)**  
  - ถ้าเชื่อม Backend: จะมีแถบสีฟ้า **"โหมด Supabase — ข้อมูลโหลดและบันทึกลงเซิร์ฟเวอร์"**  
  - ถ้าไม่เชื่อม: จะมีแถบสีเหลือง **"โหมดเก็บในเครื่อง — ข้อมูลจะไม่ส่งไปยัง Supabase ..."**

- **หลังล็อกอิน (แถบด้านข้าง)**  
  - ถ้าไม่เชื่อม: จะมีกล่องสีเหลือง **"โหมดเก็บในเครื่อง"** และข้อความว่าให้ตั้ง VITE_API_URL แล้ว Redeploy

- **หลังกดส่งคำขอลา**  
  - ถ้าเชื่อม: ข้อความสำเร็จจะลงท้าย **"— บันทึกลง Supabase แล้ว"**  
  - ถ้าไม่เชื่อม: ข้อความจะลงท้าย **"— บันทึกเฉพาะในเครื่องนี้ ไม่ได้ส่งไป Supabase ..."**

ถ้าทุกจุดบอกว่า "เก็บในเครื่อง" / "ไม่ได้ส่งไป Supabase" แปลว่า **โปรเจกต์ Frontend ยัง build โดยไม่มี VITE_API_URL** → ต้องไปเช็กที่ **A** แล้ว Redeploy

---

## 3. สรุปสั้นๆ

1. **Frontend (Vercel):** ต้องมี **VITE_API_URL** = URL ของ Backend และต้อง **Redeploy หลังตั้งค่า**  
2. **Backend (Vercel):** Root = `server`, มี **DATABASE_URL** (Supabase) และ **JWT_SECRET**  
3. เปิดแอปแล้วดูแถบ/ข้อความด้านบนและหลังส่งคำขอลา ถ้ายังเป็น "โหมดเก็บในเครื่อง" หรือ "บันทึกเฉพาะในเครื่องนี้" ให้กลับไปเช็กข้อ 1 แล้ว Redeploy อีกครั้ง
