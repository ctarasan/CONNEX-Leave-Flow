# วิธีสร้างฐานข้อมูล PostgreSQL บน AWS RDS สำหรับ LeaveFlow Pro

## 1. สร้าง RDS PostgreSQL บน AWS

1. เข้า **AWS Console** → **RDS** → **Create database**
2. เลือก **PostgreSQL** (แนะนำ v14 ขึ้นไป)
3. เลือก **Free tier** (ถ้าทดสอบ) หรือตามขนาดที่ต้องการ
4. ตั้งค่า:
   - **DB instance identifier**: `leaveflow-db`
   - **Master username**: `postgres` (หรือตามต้องการ)
   - **Master password**: ตั้งรหัสผ่านที่ปลอดภัย
5. **Public access**: เลือก Yes ถ้าเชื่อมจากเครื่องนอก AWS (ทดสอบ)
6. สร้าง database เพิ่ม: ใน **Additional configuration** → **Initial database name**: `leaveflow_db`

## 2. ตั้งค่า Security Group

- เปิดพอร์ต **5432** (PostgreSQL) สำหรับ IP ที่จะเชื่อมต่อ
- หรือตั้งค่า VPC/Security Group ให้ backend server เข้าถึง RDS ได้

## 3. รันสคริปต์สร้างตาราง

### วิธีที่ 1: ใช้ psql จากเครื่อง local

```bash
# ติดตั้ง PostgreSQL client (ถ้ายังไม่มี)
# Windows: ดาวน์โหลดจาก https://www.postgresql.org/download/windows/
# Mac: brew install postgresql

# รันสคริปต์ (เปลี่ยน YOUR_RDS_ENDPOINT เป็น endpoint ของ RDS)
psql -h YOUR_RDS_ENDPOINT.rds.amazonaws.com -U postgres -d leaveflow_db -f scripts/init-postgres-aws.sql
```

### วิธีที่ 2: ใช้ pgAdmin

1. เชื่อมต่อ RDS ด้วย pgAdmin (สร้าง Server connection ด้วย host, port 5432, username, password)
2. เปิด Query Tool
3. Copy เนื้อหาจาก `scripts/init-postgres-aws.sql` วางแล้ว Execute

### วิธีที่ 3: ใช้ AWS CloudShell / EC2 ที่มี psql

```bash
psql -h your-rds-endpoint.region.rds.amazonaws.com -U postgres -d leaveflow_db -f init-postgres-aws.sql
```

## 4. Connection String สำหรับ Backend

หลังสร้าง RDS แล้ว ใช้ connection string รูปแบบ:

```
postgresql://USERNAME:PASSWORD@YOUR_RDS_ENDPOINT:5432/leaveflow_db
```

ตัวอย่างใน `.env` ของ backend:

```
DATABASE_URL=postgresql://postgres:yourpassword@leaveflow-db.xxxxx.ap-southeast-1.rds.amazonaws.com:5432/leaveflow_db
```

## 5. ไฟล์ในโฟลเดอร์ scripts

| ไฟล์ | คำอธิบาย |
|------|----------|
| `init-postgres-aws.sql` | สคริปต์สร้างตาราง, index, enum และ seed ข้อมูล leave_types, holidays |
