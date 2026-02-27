# รีเซ็ตรหัสผ่านใน Supabase (เมื่อล็อกอินไม่ได้)

ถ้าใส่อีเมลและรหัสผ่านถูก (เช่น chamnan.t@b-connex.net / 001) แต่ยังขึ้น "อีเมลหรือรหัสผ่านไม่ถูกต้อง" มักเป็นเพราะค่า **password_hash** ในตาราง `users` ไม่ตรงกับรหัสผ่านที่ใช้ (ไม่ได้รัน seed หรือแก้รหัสใน DB เอง)

## วิธีแก้: ตั้งรหัสผ่านใน Supabase ใหม่

### 1. สร้าง hash และคำสั่ง SQL (ในเครื่องที่โฟลเดอร์ server)

```bash
cd server
npm run reset-password
```

หรือถ้าต้องการรหัสผ่าน/อีเมลอื่น:

```bash
node scripts/reset-password-hash.mjs 001 chamnan.t@b-connex.net
```

(อาร์กิวเมนต์ที่ 1 = รหัสผ่าน, อาร์กิวเมนต์ที่ 2 = อีเมล)

จะได้คำสั่ง SQL ออกมาประมาณนี้:

```sql
UPDATE users SET password_hash = '$2b$10$...' WHERE LOWER(TRIM(email)) = 'chamnan.t@b-connex.net';
```

### 2. รัน SQL ใน Supabase

1. เปิด **Supabase** → โปรเจกต์ที่ Backend ใช้
2. ไปที่ **SQL Editor**
3. วางคำสั่งที่ได้จากขั้นที่ 1
4. กด **Run**

### 3. ลองล็อกอินอีกครั้ง

ใช้อีเมลและรหัสผ่านที่ตรงกับที่ใส่ในคำสั่ง (เช่น chamnan.t@b-connex.net / 001)

---

**หมายเหตุ:** ถ้าในตาราง `users` ไม่มีแถวที่มีอีเมลนี้ แปลว่ายังไม่มีผู้ใช้ใน DB ต้องเพิ่มผู้ใช้ก่อน (หรือรัน seed จาก CONNEX_Data.csv)
