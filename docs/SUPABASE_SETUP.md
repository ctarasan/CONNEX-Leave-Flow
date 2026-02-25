# ติดตั้งฐานข้อมูล LeaveFlow Pro บน Supabase

Supabase ให้ PostgreSQL แบบ managed ฟรี tier เหมาะสำหรับพัฒนาและ deploy

---

## ขั้นตอนที่ 1: สร้างโปรเจกต์ Supabase

1. ไปที่ **https://supabase.com** แล้วลงชื่อเข้าใช้
2. กด **New Project**
3. ตั้งค่า:
   - **Name:** `leaveflow-pro` (หรือชื่อที่ต้องการ)
   - **Database Password:** ตั้งรหัสผ่านที่แข็งแรง (เก็บไว้ใช้ต่อ)
   - **Region:** เลือกที่ใกล้ผู้ใช้ (เช่น Singapore)
4. กด **Create new project** แล้วรอให้สร้างเสร็จ

---

## ขั้นตอนที่ 2: รันสคริปต์สร้างตาราง

1. ในโปรเจกต์ที่สร้างแล้ว ไปที่เมนู **SQL Editor** (แถบซ้าย)
2. กด **New query**
3. เปิดไฟล์ **`scripts/init-supabase.sql`** ในโปรเจกต์ แล้ว copy เนื้อหาทั้งหมด
4. วางลงใน SQL Editor ของ Supabase
5. กด **Run** (หรือ Ctrl+Enter)
6. ถ้ารันสำเร็จจะเห็นข้อความ "Success. No rows returned"

ถ้าเคยรันสคริปต์นี้ไปแล้วและรันซ้ำอีก จะ error เพราะ type/table มีอยู่แล้ว — ให้รันครั้งเดียวในโปรเจกต์ใหม่เท่านั้น

---

## ขั้นตอนที่ 3: ดู Connection String

ใช้ต่อเมื่อเขียน Backend เพื่อเชื่อมต่อ DB:

1. ไปที่ **Project Settings** (ไอคอนฟันเฟือง) → **Database**
2. หา **Connection string** เลือก **URI**
3. คัดลอกแล้วแทนที่รหัสผ่านใน `[YOUR-PASSWORD]` ด้วยรหัสที่ตั้งไว้ตอนสร้างโปรเจกต์

รูปแบบ:

```
postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

สำหรับการเชื่อมแบบตรง (ไม่ผ่าน pooler) ใช้ **Direct connection** ในหน้าเดียวกัน

---

## ขั้นตอนที่ 4: (ถ้ามี Backend) ตั้งค่าใน .env

ในโปรเจกต์ Backend (เช่นโฟลเดอร์ `server/`):

```env
DATABASE_URL=postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

จากนั้นแอป Backend จะอ่านจาก `process.env.DATABASE_URL` เพื่อเชื่อม Supabase

---

## สรุป

| ขั้นตอน | การกระทำ |
|---------|----------|
| 1 | สร้างโปรเจกต์ที่ supabase.com |
| 2 | SQL Editor → วางเนื้อจาก `scripts/init-supabase.sql` → Run |
| 3 | Project Settings → Database → Copy connection string |
| 4 | ใส่ใน Backend .env เป็น `DATABASE_URL` |

ตอนนี้ฐานข้อมูลบน Supabase พร้อมใช้แล้ว — ต่อไปคือเขียนหรือปรับ Backend ให้ใช้ `DATABASE_URL` นี้ (ดูรายละเอียดใน `docs/POSTGRESQL_SETUP.md`)
