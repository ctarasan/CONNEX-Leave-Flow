export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

/** ประเภทวันลาใช้ id จาก LeaveTypeDefinition (จัดการใน Admin) */
export enum UserRole {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  ADMIN = 'ADMIN'
}

export type Gender = 'male' | 'female';

/** คำจำกัดความประเภทวันลา (เพิ่ม/แก้ไข/ลบได้ที่หน้าจัดการประเภทวันลา) */
export interface LeaveTypeDefinition {
  id: string;
  label: string;
  /** ใช้กับเพศใด: ชาย / หญิง / ทั้งสอง */
  applicableTo: 'male' | 'female' | 'both';
  /** โควต้าวันต่อปี (เช่น 999 = ไม่จำกัด) */
  defaultQuota: number;
  order: number;
  isActive: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  gender: Gender;
  department: string;
  joinDate: string; // ISO string (YYYY-MM-DD)
  managerId?: string;
  /** โควต้าตามประเภทวันลา (key = leaveTypeId) — ตั้งค่าจากประเภทวันลา ไม่แก้ที่หน้าพนักงาน */
  quotas: Record<string, number>;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  type: string; // leaveTypeId
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  reviewedAt?: string;
  managerComment?: string;
}

/** @deprecated ใช้ LeaveTypeDefinition จาก store แทน */
export enum LeaveType {
  SICK = 'SICK',
  VACATION = 'VACATION',
  PERSONAL = 'PERSONAL',
  MATERNITY = 'MATERNITY',
  STERILIZATION = 'STERILIZATION',
  OTHER = 'OTHER',
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // HH:mm:ss
  checkOut?: string; // HH:mm:ss
  isLate: boolean;
  penaltyApplied: boolean;
}

export interface MonthlyReport {
  month: string;
  totalRequests: number;
  approved: number;
  rejected: number;
  byType: Record<string, number>;
}
