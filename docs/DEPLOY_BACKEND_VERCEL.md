# Deploy Backend (Express) บน Vercel

## สิ่งที่เตรียมไว้ในโปรเจกต์แล้ว

- โฟลเดอร์ `server/` พร้อม `vercel.json` และ `api/index.ts` สำหรับ Vercel Serverless
- Build: `npm run build` จะสร้าง `dist/` และใช้ในฟังก์ชัน `/api`

## ขั้นตอน Deploy บน Vercel

### 1. สร้างโปรเจกต์ Backend ใหม่บน Vercel

1. ไปที่ [vercel.com](https://vercel.com) → **Add New** → **Project**
2. เลือก Repo เดิม: **CONNEX-Leave-Flow** (หรือ repo ที่มีโฟลเดอร์ `server`)
3. **สำคัญ:** ตั้งค่า **Root Directory**  
   - กด **Edit** ข้าง Root Directory  
   - ใส่ **`server`**  
   - เพื่อให้ Vercel ใช้โฟลเดอร์ `server` เป็น root ของโปรเจกต์นี้ (ไม่ใช้ root ของ repo)

### 2. ตั้งค่า Environment Variables

ก่อนกด Deploy ให้เพิ่มตัวแปรต่อไปนี้ใน **Environment Variables** (ใช้ได้ทั้ง Production / Preview / Development ตามต้องการ):

| Name | ค่าที่ต้องใส่ | หมายเหตุ |
|------|----------------|----------|
| `DATABASE_URL` | Connection string ของ Supabase (Postgres) | เช่น `postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:6543/postgres` |
| `JWT_SECRET` | คีย์ยาวๆ สำหรับ sign JWT | เช่น สร้างด้วย `openssl rand -base64 32` |
| `OFFICE_IP_RANGES` | (ถ้าต้องการ) จำกัด IP ลงเวลา | เช่น `192.168.1.,10.0.0.` คั่นด้วย comma |

- ไม่ต้องตั้ง `PORT` บน Vercel (Vercel กำหนดให้เอง)
- ถ้าไม่ตั้ง `DATABASE_URL` / `JWT_SECRET` Backend จะ error ตอนเรียก API

### 3. Deploy

กด **Deploy** และรอ build จบ

### 4. เอา URL Backend ไปใส่ใน Frontend

หลัง deploy สำเร็จ:

1.  copy **URL ของโปรเจกต์ Backend** (เช่น `https://connex-leave-flow-api.vercel.app`)
2.  ไปที่โปรเจกต์ **Frontend** (connex-leave-flow) บน Vercel  
    → **Settings** → **Environment Variables**
3.  เพิ่มตัวแปร:
   - **Name:** `VITE_API_URL`
   - **Value:** URL เต็มของ Backend (ไม่มี `/api` ต่อท้าย)  
     เช่น `https://connex-leave-flow-api.vercel.app`
4.  **Redeploy โปรเจกต์ Frontend** หนึ่งครั้ง เพื่อให้ build ใหม่อ่าน `VITE_API_URL`

## ตรวจสอบหลัง Deploy

- เปิด `https://<backend-url>/api/health` ควรได้ `{"ok":true,"message":"Backend is running"}`
- เปิด `https://<backend-url>/api/status` ควรได้ `database: true` ถ้าต่อ Supabase ได้

## สรุป

- **Backend** = โปรเจกต์ Vercel แยก (Root Directory = `server`)
- **Frontend** = โปรเจกต์เดิม (Root Directory ว่าง) และต้องมี `VITE_API_URL` ชี้ไปที่ URL ของ Backend
