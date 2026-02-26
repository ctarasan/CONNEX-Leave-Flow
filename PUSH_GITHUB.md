# การ Push ขึ้น GitHub

## ครั้งแรก (ถ้ายังไม่ได้เพิ่ม remote)

1. สร้าง repository ใหม่บน GitHub (ไม่ต้องใส่ README / .gitignore)
2. ในโฟลเดอร์โปรเจกต์ รัน:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

แทน `YOUR_USERNAME` และ `YOUR_REPO_NAME` ด้วยชื่อผู้ใช้และชื่อ repo จริง

## หลังจากมี remote แล้ว

เมื่อมีการแก้ไขโค้ด สามารถ push ได้ด้วย:

```bash
git add .
git commit -m "อัปเดตโค้ด"
git push origin main
```

---

**หมายเหตุ:** ไฟล์ `.env` และ `server/.env` ถูก exclude ใน `.gitignore แล้ว จะไม่ถูก push ขึ้น GitHub (เพื่อความปลอดภัยของรหัสผ่านและ connection string)
