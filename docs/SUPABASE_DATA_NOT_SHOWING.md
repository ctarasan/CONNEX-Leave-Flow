# เมื่อระบบไม่แสดงข้อมูลเก่าจาก Supabase

## สิ่งที่ระบบแก้แล้ว (ในโค้ด)

1. **โหลดข้อมูลจาก API เสมอเมื่อโหมด API**  
   - ตั้งค่า cache (users, leave requests) จากผลลัพธ์ API ทุกครั้ง แม้จะได้รายการว่าง  
   - ในโหมด API ไม่ใช้ข้อมูลคำขอลาจาก localStorage ถ้ายังไม่เคยโหลดจาก API (ไม่แสดงข้อมูลเก่าจากเครื่องโดยไม่ตั้งใจ)

2. **รอโหลดจาก API ก่อนแสดงหน้าหลัก**  
   - เมื่อใช้โหมด API จะแสดง "กำลังโหลดข้อมูลจากเซิร์ฟเวอร์..." จนกว่า `loadFromApi()` จะทำงานเสร็จ  
   - หลังโหลดเสร็จจึงแสดงหน้า Login หรือแดชบอร์ดตามสถานะล็อกอิน และข้อมูลที่แสดงจะมาจาก Supabase ผ่าน Backend

## สิ่งที่ต้องตรวจสอบถ้าข้อมูลยังไม่แสดง

### 1. ตั้งค่า VITE_API_URL บน Frontend (Vercel / build)

- แอปจะโหมด API ก็ต่อเมื่อมี **VITE_API_URL** ตอน build
- บน **Vercel**: Project → Settings → Environment Variables → ใส่  
  **`VITE_API_URL`** = URL เต็มของ Backend (เช่น `https://your-backend.railway.app` หรือ `https://your-api.vercel.app`)
- จากนั้น **Redeploy** โปรเจกต์ (build ใหม่) เพื่อให้ค่า env ถูกใส่ในแอป

ถ้าไม่ตั้งค่านี้ แอปจะไม่โหลดจาก Supabase และจะใช้เฉพาะข้อมูลใน localStorage ของเบราว์เซอร์

### 2. Backend ชี้ไปที่ Supabase และมีข้อมูล

- **DATABASE_URL** ใน Backend ต้องชี้ไปที่ Supabase (connection string ของโปรเจกต์นั้น)
- ตรวจใน Supabase (Table Editor) ว่ามีข้อมูลในตาราง `users`, `leave_requests`, `leave_types`, `holidays` ตามที่แอปใช้
- ถ้า Backend รันบน Vercel / serverless ต้องตั้ง **DATABASE_URL** ใน Environment Variables ของโปรเจกต์ Backend ด้วย

### 3. CORS และ Network

- Backend ต้องอนุญาต origin ของหน้า Frontend (เช่น `https://your-app.vercel.app`)
- เปิด DevTools (F12) → แท็บ **Network**: ดูว่า request ไปที่ Backend (เช่น `/api/users`, `/api/leave-requests`) เป็น status 200 หรือมี error (401, 403, 500, CORS)
- เปิดแท็บ **Console**: ถ้าโหลดข้อมูลไม่สำเร็จ จะมีข้อความ `[loadFromApi] getUsers failed:` หรือ `[loadFromApi] getLeaveRequests failed:` พร้อมรายละเอียด error

### 4. ล็อกอินและ Token

- หลังล็อกอิน Backend จะส่ง token มา และแอปจะส่ง token นี้ใน request ถัดไป
- ถ้า request ได้ 401 Unauthorized แปลว่าล็อกอินหมดอายุหรือ token ผิด → ลองล็อกอินใหม่

---

## เมื่อรายการที่ทำผ่าน Frontend ไม่ปรากฏใน Supabase (ไม่มีการบันทึกลงเซิร์ฟเวอร์)

ถ้ายื่นคำขอลา / เพิ่มผู้ใช้ / อนุมัติคำขอ ผ่าน Frontend แล้วไปดูใน Supabase ไม่มีรายการดังกล่าว แปลว่า **Frontend ยังไม่เชื่อมกับ Backend** — ข้อมูลถูกเก็บเฉพาะใน localStorage ของเบราว์เซอร์

### สาเหตุและวิธีแก้

- **สาเหตุ:** โปรเจกต์ Frontend (บน Vercel) ถูก **build โดยไม่มีตัวแปร VITE_API_URL** ดังนั้นแอปจะทำงานใน "โหมดเก็บในเครื่อง" เท่านั้น ไม่เรียก API และไม่ส่งข้อมูลไป Backend/Supabase
- **วิธีแก้:**
  1. ไปที่ **Vercel** → เลือกโปรเจกต์ **Frontend** (connex-leave-flow)
  2. **Settings** → **Environment Variables**
  3. เพิ่มตัวแปร **`VITE_API_URL`** = URL เต็มของ Backend (เช่น `https://your-backend.vercel.app` ไม่มี `/api` ต่อท้าย)
  4. **สำคัญ:** หลังเพิ่มหรือแก้ env ต้อง **Redeploy** โปรเจกต์ Frontend (Deployments → ⋮ → Redeploy) เพื่อให้ build ใหม่มีค่า `VITE_API_URL` ในแอป

หลัง Redeploy แล้ว เปิดแอปใหม่ ถ้าเชื่อมสำเร็จจะเห็นแถบ **"โหมด Supabase — ข้อมูลโหลดและบันทึกลงเซิร์ฟเวอร์"** ที่ด้านบน (ไม่มีแถบสีเหลือง "โหมดเก็บในเครื่อง") และคำขอลา/ผู้ใช้ที่ทำจาก Frontend จะไปปรากฏใน Supabase

---

สรุป: ให้ตรวจว่า **VITE_API_URL** ถูกตั้งตอน build และ **Backend ต่อ Supabase ได้และมีข้อมูลในตาราง** จากนั้นรอหน้า "กำลังโหลดข้อมูลจากเซิร์ฟเวอร์..." จบแล้วข้อมูลจาก Supabase ควรแสดงตามที่โหลดได้จาก API และการบันทึกจาก Frontend จะลง Supabase ผ่าน Backend
