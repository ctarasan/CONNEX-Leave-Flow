# การออกแบบประสิทธิภาพ (รองรับองค์กร 10,000+ คน)

สรุปการปรับปรุงเพื่อไม่ให้การเรียกดูข้อมูลช้าเมื่อข้อมูลพนักงานและคำขอลามาก

---

## 1. Cache ในหน่วยความจำ (store)

- **getAllUsers()**  
  - Parse จาก localStorage และ normalize แค่ครั้งแรก (หรือหลัง invalidate)  
  - ครั้งถัดไปคืนค่าจาก cache  
  - Invalidate เมื่อ: `updateUser`, `addUser`, `deleteUser`, `resetAllData`

- **getLeaveRequests()**  
  - เหมือนกัน: cache หลัง parse ครั้งแรก  
  - Invalidate เมื่อ: `saveLeaveRequest`, `updateRequestStatus`, `resetAllData`

ผล: ลดการ `JSON.parse(localStorage)` ซ้ำเมื่อมี 10k users / หลักหมื่นคำขอ

---

## 2. Index สำหรับค้นหา O(1)

- **User ตาม id**  
  - เก็บ `_usersByIdCache: Map<string, User>` คู่กับ cache รายชื่อ  
  - `getInitialUser()`, `saveAttendance`, `saveLeaveRequest`, `updateRequestStatus` ใช้ `Map.get(id)` แทน `users.find(u => u.id === id)`

- **LeaveRequest ตาม id**  
  - เก็บ `_leaveRequestsByIdCache: Map<string, LeaveRequest>`  
  - `updateRequestStatus` ใช้ `Map.get(id)` แทน `requests.find(r => r.id === id)`

ผล: ค้นหาตาม id เป็น O(1) แทน O(n)

---

## 3. สายงาน (subordinates) แบบ O(n)

- **buildManagerToChildrenMap(users)**  
  - สร้าง `Map<managerId, childIds[]>` ในหนึ่งรอบ O(n)

- **getSubordinateIdsRecursive(managerId, users)**  
  - ใช้ map ข้างบน + BFS รวบรวม id ทั้งสาย  
  - ไม่ filter array หลายชั้น → รวมแล้ว O(n)

- **getSubordinateIdSetRecursive(managerId, users)**  
  - คืนค่า `Set<string>` สำหรับใช้ `.has(userId)` แทน `array.includes(userId)`  
  - การกรองคำขอ: `requests.filter(r => subordinateSet.has(r.userId))` เป็น O(1) ต่อรายการ

ผล: การดึงสายงานและกรองคำขอตามสายงานไม่กลายเป็น O(n²) หรือ O(n·depth)

---

## 4. จุดที่ใช้ Set แทน array

- **App.tsx**  
  - `fetchData` (Manager): `getSubordinateIdSetRecursive` + `managedRequests.filter(r => subordinateSet.has(r.userId))`  
  - `displayRequests` (Manager): เหมือนกัน

- **ReportSummary, TeamAttendance**  
  - กรองรายชื่อพนักงานด้วย `getSubordinateIdSetRecursive` + `.has(u.id)`

ผล: การเช็กว่า userId อยู่ในสายงานเป็น O(1) ต่อคำขอ/ต่อ user

---

## สรุปความซับซ้อน (โดยประมาณ)

| การทำงาน | ก่อน | หลัง |
|----------|------|------|
| โหลด users (หลายครั้งต่อ session) | O(n) parse ทุกครั้ง | O(n) parse ครั้งเดียว + cache |
| โหลด leave requests | O(m) parse ทุกครั้ง | O(m) parse ครั้งเดียว + cache |
| ค้นหา user ตาม id | O(n) | O(1) |
| ค้นหา request ตาม id | O(m) | O(1) |
| รายชื่อสายงาน (recursive) | O(n × depth) filter หลายชั้น | O(n) map ครั้งเดียว + BFS |
| กรองคำขอตามสายงาน | O(m × สายงาน) ถ้าใช้ array.includes | O(m) ถ้าใช้ Set.has |

(n = จำนวนพนักงาน, m = จำนวนคำขอลา)
