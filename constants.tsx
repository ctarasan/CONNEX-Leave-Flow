import { LeaveStatus } from './types';

/** เวอร์ชันระบบ — แสดงข้างชื่อ Leave Flow Pro (ปรับขึ้นเมื่อมีการแก้ไขโปรแกรม) */
export const APP_VERSION = '1.0.5';

/** ชื่อระบบพร้อมเวอร์ชัน (สำหรับแสดงบน UI) */
export const APP_TITLE_WITH_VERSION = `Leave Flow Pro v${APP_VERSION}`;

/** ป้ายชื่อประเภทวันลาอยู่ที่ store (getLeaveTypes) แล้ว ไม่ใช้ค่านี้สำหรับประเภทแบบเดิม */
export const STATUS_LABELS: Record<LeaveStatus, string> = {
  [LeaveStatus.PENDING]: 'รออนุมัติ',
  [LeaveStatus.APPROVED]: 'อนุมัติแล้ว',
  [LeaveStatus.REJECTED]: 'ไม่อนุมัติ',
};

export const STATUS_COLORS: Record<LeaveStatus, string> = {
  [LeaveStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [LeaveStatus.APPROVED]: 'bg-green-100 text-green-800',
  [LeaveStatus.REJECTED]: 'bg-red-100 text-red-800',
};

/**
 * รายการวันหยุดประจำปี 2569 ตามประกาศบริษัท (Map: yyyy-mm-dd -> Holiday Name)
 */
export const HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': 'วันขึ้นปีใหม่',
  '2026-03-03': 'วันมาฆบูชา',
  '2026-04-06': 'วันจักรี',
  '2026-04-13': 'วันสงกรานต์',
  '2026-04-14': 'วันสงกรานต์',
  '2026-04-15': 'วันสงกรานต์',
  '2026-05-01': 'วันแรงงานแห่งชาติ',
  '2026-05-04': 'วันฉัตรมงคล',
  '2026-06-01': 'ชดเชยวันวิสาขบูชา',
  '2026-06-03': 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสุทิดาฯ',
  '2026-07-28': 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว',
  '2026-07-29': 'วันอาสาฬหบูชา',
  '2026-08-12': 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสิริกิติ์ฯ และวันแม่แห่งชาติ',
  '2026-10-13': 'วันนวมินทรมหาราช',
  '2026-10-23': 'วันปิยมหาราช',
  '2026-12-07': 'ชดเชยวันพ่อแห่งชาติ',
  '2026-12-10': 'วันรัฐธรรมนูญ',
  '2026-12-31': 'วันสิ้นปี',
};
