# การแสดงข้อมูลตามผู้บังคับบัญชา (Manager / พนักงานใต้สังกัด)

เอกสารสรุปจุดที่ระบบกรองให้ Manager เห็นเฉพาะพนักงานใต้บังคับบัญชา (managerId === currentUser.id) และจุดที่ตรวจสอบแล้ว

---

## 1. App.tsx — การโหลดคำขอลา (fetchData)

- **ADMIN:** แสดงคำขอลาทั้งหมด (`setRequests(allRequests)`)
- **MANAGER:** แสดงเฉพาะคำขอของลูกทีม  
  `allRequests.filter(request => employee?.managerId === updatedUser.id)`  
  โดย `employee = allUsers.find(u => u.id === request.userId)`
- **EMPLOYEE:** แสดงเฉพาะคำขอของตัวเอง (`r.userId === updatedUser.id`)

ผล: ศรีประไพ (004) จะได้เฉพาะคำขอของนางสาวเกศินี (017) ที่มี managerId === '004'

---

## 2. ApprovalBoard

- รับ `requests` จาก App (ถูกกรองตามบทบาทแล้ว)
- แสดงเฉพาะคำขอที่ `status === PENDING`
- ไม่ดึงหรือกรอง users เอง → ใช้ข้อมูลจาก App ได้ถูกต้อง

---

## 3. store.ts — updateRequestStatus

- **ตรวจสอบสิทธิ์:** ก่อนอัปเดตสถานะ ตรวจว่า  
  `employee.managerId === managerId`  
  (พนักงานที่ยื่นคำขอต้องมีผู้บังคับบัญชาเป็นคนที่กดอนุมัติ)
- ถ้าไม่ตรง จะไม่อัปเดตและไม่สร้างการแจ้งเตือน
- ป้องกันการอนุมัติข้ามสายบังคับบัญชา (รวมกรณีที่ front-end ถูกแก้)

---

## 4. ReportSummary

- รับ `requests` (กรองแล้วจาก App) และ `currentUser`
- **Dropdown "เลือกพนักงาน":**
  - **ADMIN:** แสดงทุกคน (`getAllUsers()`)
  - **MANAGER:** แสดงเฉพาะลูกทีม  
    `allUsers.filter(u => u.managerId === currentUser.id)`
  - **EMPLOYEE:** แสดงเฉพาะตัวเอง
- Pivot / ตารางประวัติ ใช้ `filteredRequests` ที่มาจาก `requests` ที่กรองแล้ว → แสดงเฉพาะคนในสังกัดของ Manager

---

## 5. TeamAttendance (การเข้างานของทีม)

- รับ `manager: User`
- ลูกทีม: `allUsers.filter(u => u.managerId === manager.id)`
- ใช้เฉพาะ `subordinates` ในการแสดงและกรอง attendance

---

## 6. AdminPanel

- ใช้ได้เฉพาะ **ADMIN**
- ตารางพนักงาน: แสดงทุกคน (getAllUsers) สำหรับจัดการระบบ
- Dropdown "ผู้บังคับบัญชา" ตอนแก้ไขพนักงาน: แสดงเฉพาะ role MANAGER/ADMIN (ไม่เกี่ยวกับการกรองลูกทีมของ Manager)

---

## 7. จุดอื่นที่เกี่ยวข้อง

- **ประวัติการลา (History):** ใช้ `requests.filter(r => r.userId === currentUser.id)` → แสดงเฉพาะคำขอของตัวเอง (ทั้ง Manager และ Employee)
- **รายการลาล่าสุด (Dashboard):** ใช้ `requests.filter(r => r.userId === currentUser.id)` เช่นกัน → แสดงเฉพาะของตัวเอง
- **NotificationCenter:** ใช้ `getNotifications(updatedUser.id)` → เฉพาะการแจ้งเตือนของ user ที่ล็อกอิน
- **LeaveForm:** นับการใช้โควต้าจาก `r.userId === user.id` → เฉพาะของ user ที่ล็อกอิน
- **Login:** ใช้ getAllUsers เฉพาะสำหรับตรวจสอบ email/password ไม่ได้ใช้แสดงรายชื่อลูกทีม

---

## สรุป

| จุด | การกรอง | หมายเหตุ |
|-----|---------|----------|
| fetchData (Manager) | employee.managerId === updatedUser.id | ถูกต้อง |
| updateRequestStatus | employee.managerId === managerId | เพิ่มการตรวจใน store แล้ว |
| ReportSummary dropdown | users โดย Manager = ลูกทีมเท่านั้น | แก้แล้ว |
| TeamAttendance | u.managerId === manager.id | ถูกต้องตั้งแต่แรก |
| ApprovalBoard | ใช้ requests จาก App | ถูกต้อง |
| AdminPanel | เฉพาะ ADMIN, แสดงทุกคน | ถูกต้อง |
