# คู่มือนักพัฒนา (LeaveFlow Pro)

เอกสารนี้ช่วยให้โปรแกรมเมอร์ดูแลและพัฒนาต่อได้อย่างราบรื่น

---

## 1. ภาพรวมโปรเจกต์

- **แอป:** ระบบบริหารการลาพนักงาน (HR Leave Management)
- **Frontend:** React 19 + TypeScript + Vite
- **ข้อมูล:** เก็บใน **localStorage** (ยังไม่มี Backend จริง; มีเอกสารเชื่อม PostgreSQL ใน `docs/POSTGRESQL_SETUP.md`)
- **บทบาท:** ADMIN, MANAGER, EMPLOYEE — ใช้กำหนดสิทธิ์การเห็นรายการลาและอนุมัติ

---

## 2. โครงสร้างโฟลเดอร์หลัก

```
Cursor_App/
├── App.tsx                 # จุดเข้าแอป, routing แท็บ, state หลัก (currentUser, requests)
├── types.ts                # TypeScript types/enums (User, LeaveRequest, UserRole, ...)
├── store.ts                # Logic ข้อมูล: อ่าน/เขียน localStorage, cache, validation
├── constants.tsx           # สถานะคำขอลา, สี, วันหยุดประจำปี (HOLIDAYS_2026)
├── connexSeed.ts           # ข้อมูลเริ่มต้นพนักงานจาก CONNEX_Data.csv
├── components/             # React components
│   ├── Login.tsx
│   ├── LeaveForm.tsx       # ฟอร์มยื่นลา
│   ├── ApprovalBoard.tsx   # บอร์ดอนุมัติ (Manager/Admin)
│   ├── NotificationCenter.tsx
│   ├── AdminPanel.tsx       # จัดการพนักงาน, ประเภทวันลา, วันหยุด
│   ├── ReportSummary.tsx    # สรุปรายงาน, ปฏิทิน, ตารางประวัติ
│   ├── AttendanceModule.tsx
│   ├── TeamAttendance.tsx
│   ├── VacationLedger.tsx
│   └── DatePicker.tsx
├── services/               # บริการภายนอก (เช่น Gemini ถ้ามี)
├── docs/                   # เอกสาร
│   ├── DEVELOPER.md        # ไฟล์นี้
│   ├── POSTGRESQL_SETUP.md # เชื่อมต่อ Backend + PostgreSQL
│   └── MANAGER_SUBORDINATE_SCOPING.md
├── scripts/
│   ├── init-postgres-aws.sql  # สคริปต์สร้าง DB บน AWS RDS
│   └── README-AWS-DATABASE.md
└── package.json
```

---

## 3. ชั้นข้อมูล (Data Layer)

### 3.1 `store.ts`

- **Storage keys:** ดู `STORAGE_KEYS` (users, leave_requests, notifications, attendance, holidays, leave_types)
- **Cache:** มี cache สำหรับ users และ leave_requests; ต้องเรียก `invalidateUsersCache()` / `invalidateLeaveRequestsCache()` หลังอัปเดต
- **ข้อมูลเริ่มต้นพนักงาน:** มาจาก `connexSeed.ts` ผ่าน `buildInitialUsersFromConnex()` — ใช้เมื่อ localStorage ไม่มี `hr_users_list` (เช่น หลังกดรีเซ็ต)
- **ฟังก์ชันสำคัญ:**
  - `getAllUsers()`, `getLeaveRequests()`, `getNotifications()`, `getAttendanceRecords()`
  - `saveLeaveRequest()`, `updateRequestStatus()` — ตรวจสอบซ้อนทับวันลา + ส่งเฉพาะผู้บังคับบัญชาโดยตรง
  - `getSubordinateIdsRecursive(managerId, users)` — ใช้กำหนดว่า Manager เห็นคำขอของใคร
  - `resetAllData()` — ล้าง storage ทั้งหมด แล้ว reload ใช้ข้อมูลจาก CONNEX อีกครั้ง

### 3.2 `connexSeed.ts`

- เก็บเนื้อหา CSV ของพนักงาน (ชื่อไทยถูกต้อง) และฟังก์ชัน `parseConnexCSV()` กับ `thaiDateToISODate()`
- ถ้าต้องเปลี่ยนรายชื่อ/ตำแหน่ง/ผู้บังคับบัญชา ให้แก้ใน `CONNEX_CSV` หรืออัปเดต logic ใน `store.ts` ฟังก์ชัน `buildInitialUsersFromConnex()`

### 3.3 `types.ts`

- **User:** id, name, email, password, role, gender, department, joinDate, managerId?, quotas
- **LeaveRequest:** id, userId, userName, type, startDate, endDate, reason, status, submittedAt, reviewedAt?, managerComment?
- **UserRole:** EMPLOYEE, MANAGER, ADMIN
- **LeaveStatus:** PENDING, APPROVED, REJECTED
- อื่นๆ: Notification, AttendanceRecord, LeaveTypeDefinition

---

## 4. บทบาทและสิทธิ์

| บทบาท   | สิทธิ์หลัก |
|----------|------------|
| ADMIN    | เห็นทุกอย่าง, จัดการพนักงาน/ประเภทวันลา/วันหยุด, รีเซ็ตข้อมูล, อนุมัติคำขอของลูกทีมตรง (managerId = ตัวเอง) |
| MANAGER  | เห็นลูกทีม (recursive), อนุมัติได้เฉพาะคำขอของคนที่ managerId = ตัวเอง, ดูรายงานสรุป |
| EMPLOYEE | เห็นเฉพาะข้อมูลตัวเอง, ยื่นลา, ลงเวลา, ดูประวัติตัวเอง |

- **บอร์ดอนุมัติ:** แสดงเฉพาะคำขอที่ `employee.managerId === currentUser.id` (ไม่ให้ Admin เห็นคำขอของลูกทีม Manager อื่น)

---

## 5. จุดที่มักแก้เมื่อเพิ่มฟีเจอร์

| ต้องการทำอะไร | ไฟล์/จุดที่เกี่ยวข้อง |
|----------------|------------------------|
| เพิ่ม/แก้ประเภทวันลา | `store.ts`: INITIAL_LEAVE_TYPES, getLeaveTypes, saveLeaveTypes; AdminPanel จัดการประเภทวันลา |
| เพิ่มฟิลด์ใน User | `types.ts` (User), `store.ts` (buildInitialUsersFromConnex, getAllUsers normalize), AdminPanel ฟอร์มแก้ไข |
| เปลี่ยนกฎอนุมัติ (ใครอนุมัติได้) | `App.tsx`: approvalBoardRequests; `store.ts`: updateRequestStatus (ตรวจ employee.managerId) |
| เพิ่ม validation การยื่นลา | `store.ts`: saveLeaveRequest; `components/LeaveForm.tsx`: validationMessage, handleSubmit |
| แก้รายงานสรุป/ปฏิทิน | `components/ReportSummary.tsx` (filter, sort, ปฏิทินใช้ toLocalDateString เพื่อไม่ให้ timezone เลื่อนวัน) |
| เพิ่มแท็บ/เมนู | `App.tsx`: activeTab, ปุ่ม sidebar, เงื่อนไขแสดง component |

---

## 6. ข้อตกลงและแนวทางเขียนโค้ด

- **วันที่:** ใช้รูปแบบ `YYYY-MM-DD` (ISO date) ใน storage และ API
- **เวลา:** ใช้ `HH:mm:ss` สำหรับ check-in/check-out
- **ภาษา:** UI เป็นภาษาไทย; ตัวแปร/คอมเมนต์เป็นไทยหรืออังกฤษได้
- **Validation:** ตรวจและจำกัดความยาวที่ store ก่อนเขียน (เช่น MAX_REASON_LENGTH, MAX_MANAGER_COMMENT_LENGTH)
- **Cache:** หลังอัปเดต users หรือ leave_requests ต้อง invalidate cache ที่เกี่ยวข้อง

---

## 7. คำสั่งและ Environment

```bash
npm install      # ติดตั้ง dependencies
npm run dev      # รัน dev server (หยุดด้วย Ctrl+C)
npm run build    # build สำหรับ production
npm run preview  # ดูผล build
```

- **Optional:** `.env.local` ใส่ `VITE_GEMINI_API_KEY=...` ถ้าใช้ฟีเจอร์ AI (ตอนนี้ส่วน AI Analysis ถูกลบออกจากรายงานแล้ว)
- ดูความปลอดภัย (OWASP) ได้จาก `README.md`

---

## 8. เอกสารที่เกี่ยวข้อง

| เอกสาร | เนื้อหา |
|--------|----------|
| `README.md` | รันแอป, Security (OWASP) |
| `docs/POSTGRESQL_SETUP.md` | สถาปัตยกรรม Backend + PostgreSQL, โครงสร้างตาราง, ตัวอย่าง API และการเปลี่ยน Frontend ให้เรียก API |
| `docs/MANAGER_SUBORDINATE_SCOPING.md` | ขอบเขตการเห็นลูกทีมของ Manager |
| `scripts/README-AWS-DATABASE.md` | สร้าง RDS บน AWS และรันสคริปต์ `init-postgres-aws.sql` |

---

## 9. สรุป Checklist สำหรับโปรแกรมเมอร์ใหม่

1. อ่าน `README.md` แล้วรัน `npm run dev` ให้ได้
2. เปิด `types.ts` และ `store.ts` เพื่อดูโครงสร้างข้อมูลและ key ใน localStorage
3. ดู flow การลาที่ `LeaveForm` → `saveLeaveRequest` → `ApprovalBoard` และ `updateRequestStatus`
4. ตรวจสิทธิ์ที่ `App.tsx` (displayRequests, approvalBoardRequests) และ `store.ts` (updateRequestStatus)
5. ถ้าจะเชื่อม Backend ให้อ่าน `docs/POSTGRESQL_SETUP.md` และใช้ `scripts/init-postgres-aws.sql` สำหรับสร้างฐานข้อมูลบน AWS
