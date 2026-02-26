# การ Push ขึ้น GitHub

## ตอนนี้โค้ดล่าสุด commit แล้ว แต่ยังไม่มี remote → ต้องเพิ่มครั้งแรก

1. เปิด repo บน GitHub ที่คุณใช้กับ Vercel (หรือสร้างใหม่)
2. ในโฟลเดอร์โปรเจกต์ (Cursor_App) รัน:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

แทน `YOUR_USERNAME` และ `YOUR_REPO_NAME` ด้วยชื่อผู้ใช้และชื่อ repo จริง (เช่น `chamn/hr-leave-flow-pro`)

ถ้ามี repo อยู่แล้วและมี branch `main` อยู่แล้ว บางครั้งต้องใช้:
```bash
git push -u origin master:main
```
เพื่อ push branch ปัจจุบัน (master) ขึ้นไปที่ branch main บน GitHub

## หลังจากมี remote แล้ว

เมื่อมีการแก้ไขโค้ด สามารถ push ได้ด้วย:

```bash
git add .
git commit -m "อัปเดตโค้ด"
git push origin main
```

---

**หมายเหตุ:** ไฟล์ `.env` และ `server/.env` ถูก exclude ใน `.gitignore แล้ว จะไม่ถูก push ขึ้น GitHub (เพื่อความปลอดภัยของรหัสผ่านและ connection string)
