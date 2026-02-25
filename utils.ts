/** Thai Buddhist Era utilities — BE year = CE year + 543 */

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** แปลงปี ค.ศ. เป็นปี พ.ศ. */
export const toBuddhistYear = (ceYear: number): number => ceYear + 543;

/** แปลง "YYYY-MM-DD" (ค.ศ.) เป็น "D เดือน พ.ศ." เช่น "15 ก.พ. 2569" */
export const formatThaiDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const [year, month, day] = parts;
  const be = parseInt(year, 10) + 543;
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11 || isNaN(be)) return dateStr;
  return `${parseInt(day, 10)} ${THAI_MONTHS_SHORT[monthIdx]} ${be}`;
};

/** แปลง "YYYY-MM-DD" (ค.ศ.) เป็น "D เดือนเต็ม พ.ศ." เช่น "15 กุมภาพันธ์ 2569" */
export const formatThaiDateFull = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const [year, month, day] = parts;
  const be = parseInt(year, 10) + 543;
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11 || isNaN(be)) return dateStr;
  return `${parseInt(day, 10)} ${THAI_MONTHS_FULL[monthIdx]} ${be}`;
};

/** แปลง "YYYY-MM" (ค.ศ.) เป็น "เดือน พ.ศ." เช่น "กุมภาพันธ์ 2569" */
export const formatThaiMonthYear = (monthStr: string): string => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const be = parseInt(year, 10) + 543;
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11 || isNaN(be)) return monthStr;
  return `${THAI_MONTHS_FULL[monthIdx]} ${be}`;
};

/** ปีปัจจุบันในปี ค.ศ. */
export const currentCEYear = (): number => new Date().getFullYear();

/** ปีปัจจุบันในปี พ.ศ. */
export const currentBEYear = (): number => new Date().getFullYear() + 543;

/** เวลาไทย (กรุงเทพ) = UTC+7 */
const THAILAND_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * แปลง datetime เป็น "D ม.ค. พ.ศ., HH:MM น." (เวลาไทย UTC+7).
 * ค่าใน DB เป็น UTC (ช้ากว่าไทย 7 ชม.) — ฟังก์ชันจะถือว่าค่าที่ได้เป็น UTC แล้วบวก 7 ชม. เพื่อแสดงเวลาไทย
 */
export const formatThaiDateTime = (isoStr: string | Date | null | undefined): string => {
  if (isoStr == null) return '—';
  let toParse: string;
  if (typeof isoStr === 'string') {
    toParse = isoStr.trim();
  } else if (typeof isoStr === 'object' && typeof (isoStr as Date).toISOString === 'function') {
    toParse = (isoStr as Date).toISOString();
  } else {
    return '—';
  }
  if (!toParse) return '—';
  if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(toParse)) {
    toParse = toParse.replace(/\s+/, 'T');
  }
  if (!toParse.endsWith('Z') && !/[-+]\d{2}:?\d{2}$/.test(toParse) && /\d{1,2}:\d{2}/.test(toParse)) {
    toParse = toParse + 'Z';
  }
  const d = new Date(toParse);
  if (isNaN(d.getTime())) return String(isoStr);
  const bangkok = new Date(d.getTime() + THAILAND_UTC_OFFSET_MS);
  const day = bangkok.getUTCDate();
  const monthIdx = bangkok.getUTCMonth();
  const be = bangkok.getUTCFullYear() + 543;
  const h = bangkok.getUTCHours();
  const m = bangkok.getUTCMinutes();
  return `${day} ${THAI_MONTHS_SHORT[monthIdx]} ${be}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} น.`;
};
