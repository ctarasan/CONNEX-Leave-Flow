import { LeaveRequest, Notification, User, UserRole, LeaveStatus, LeaveType, LeaveTypeDefinition, Gender, AttendanceRecord, TimesheetEntry, TimesheetProject, TimesheetTaskTypeDefinition } from './types';
import { HOLIDAYS_2026 } from './constants';
import { parseConnexCSV, thaiDateToISODate } from './connexSeed';
import * as api from './api';

// OWASP: Input validation limits (prevent DoS / overflow)
const MAX_REASON_LENGTH = 2000;
const MAX_MANAGER_COMMENT_LENGTH = 500;
const MAX_HOLIDAY_NAME_LENGTH = 200;
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed != null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const STANDARD_LEAVE_TYPE_IDS = ['SICK', 'VACATION', 'PERSONAL', 'MATERNITY', 'STERILIZATION', 'PATERNITY', 'ORDINATION', 'MILITARY', 'OTHER'];

function isValidLeaveTypeId(v: string, typeIds: string[]): boolean {
  if (!v || typeof v !== 'string') return false;
  if (typeIds.includes(v)) return true;
  // รองรับกรณีฟอร์มใช้ id มาตรฐาน (เช่น MATERNITY) แต่ getLeaveTypes() จาก API คืน id อื่น (เช่นตัวเลข)
  return STANDARD_LEAVE_TYPE_IDS.includes(v);
}

function isValidDateString(s: string): boolean {
  return DATE_ISO_REGEX.test(s) && !isNaN(Date.parse(s));
}

const STORAGE_KEYS = {
  LEAVE_REQUESTS: 'hr_leave_requests',
  NOTIFICATIONS: 'hr_notifications',
  CURRENT_USER: 'hr_current_user',
  USERS: 'hr_users_list',
  HOLIDAYS: 'hr_company_holidays',
  ATTENDANCE: 'hr_attendance_records',
  TIMESHEET_PROJECTS: 'hr_timesheet_projects',
  TIMESHEET_ENTRIES: 'hr_timesheet_entries',
  TIMESHEET_TASK_TYPES: 'hr_timesheet_task_types',
  LEAVE_TYPES: 'hr_leave_types',
  ATTENDANCE_LATE_POLICY: 'hr_attendance_late_policy',
};

const DEFAULT_TIMESHEET_TASK_TYPES: TimesheetTaskTypeDefinition[] = [
  { id: 'research', label: 'Research', order: 1, isActive: true },
  { id: 'coding', label: 'Coding', order: 2, isActive: true },
  { id: 'testing', label: 'Testing', order: 3, isActive: true },
  { id: 'bug-fixing', label: 'Bug Fixing', order: 4, isActive: true },
  { id: 'planning', label: 'Planning', order: 5, isActive: true },
];

export interface AttendanceLatePolicy {
  tiers: Array<{
    after: string; // HH:mm:ss
    penalty: number; // day
  }>;
}

const DEFAULT_ATTENDANCE_LATE_POLICY: AttendanceLatePolicy = {
  tiers: [
    { after: '09:30:00', penalty: 0.25 },
    { after: '10:00:00', penalty: 0.5 },
  ],
};

/** ถ้ามีค่า = ใช้ Backend API (Supabase) — อ่าน/เขียนจาก DB แทน localStorage (ใช้ getApiBase จาก api เพื่อให้ fallback โดเมน Backend ทำงาน) */
const isApiMode = () => !!api.getApiBase();

/** Cache สำหรับโหมด API (multi-user: ข้อมูลจาก Supabase) */
let _leaveTypesCache: LeaveTypeDefinition[] | null = null;
let _holidaysCache: Record<string, string> | null = null;
const _attendanceCache = new Map<string, AttendanceRecord[]>();
const _notificationsCache = new Map<string, Notification[]>();
let _timesheetTaskTypesCache: TimesheetTaskTypeDefinition[] | null = null;
let _timesheetProjectsCache: TimesheetProject[] | null = null;
let _timesheetEntriesCache: TimesheetEntry[] | null = null;

function getLocalTimesheetTaskTypes(): TimesheetTaskTypeDefinition[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TIMESHEET_TASK_TYPES);
  const parsed = safeJsonParse<unknown[]>(stored, []);
  const list = Array.isArray(parsed) ? parsed : [];
  const normalized = list
    .map(normalizeTimesheetTaskType)
    .filter((x): x is TimesheetTaskTypeDefinition => x !== null)
    .sort((a, b) => a.order - b.order);
  return normalized.length > 0 ? normalized : DEFAULT_TIMESHEET_TASK_TYPES;
}

function getLocalTimesheetProjects(): TimesheetProject[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TIMESHEET_PROJECTS);
  const parsed = safeJsonParse<unknown[]>(stored, []);
  const list = Array.isArray(parsed) ? parsed : [];
  return list
    .map(normalizeTimesheetProject)
    .filter((x): x is TimesheetProject => x !== null);
}

function getLocalTimesheetEntries(): TimesheetEntry[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TIMESHEET_ENTRIES);
  const parsed = safeJsonParse<unknown[]>(stored, []);
  const list = Array.isArray(parsed) ? parsed : [];
  return list
    .map(normalizeTimesheetEntry)
    .filter((x): x is TimesheetEntry => x !== null)
    .sort((a, b) => (a.date === b.date ? b.updatedAt.localeCompare(a.updatedAt) : b.date.localeCompare(a.date)));
}

async function migrateLocalTimesheetToApiIfNeeded(apiTaskTypes: TimesheetTaskTypeDefinition[], apiProjects: TimesheetProject[], apiEntries: TimesheetEntry[]): Promise<void> {
  if (!isApiMode()) return;
  const localTaskTypes = getLocalTimesheetTaskTypes();
  const localProjects = getLocalTimesheetProjects();
  const localEntries = getLocalTimesheetEntries();

  const shouldMigrateTaskTypes = localTaskTypes.length > 0;
  const shouldMigrateProjects = localProjects.length > 0;
  const shouldMigrateEntries = localEntries.length > 0;

  if (!shouldMigrateTaskTypes && !shouldMigrateProjects && !shouldMigrateEntries) return;

  try {
    const apiTaskMap = new Map(apiTaskTypes.map((t) => [t.id, t]));
    const apiProjectMap = new Map(apiProjects.map((p) => [p.id, p]));
    const apiEntryMap = new Map(apiEntries.map((e) => [`${e.userId}|${e.date}|${e.projectId}|${e.taskType}`, e]));

    if (shouldMigrateTaskTypes) {
      const changedTaskTypes = localTaskTypes.filter((t) => {
        const existing = apiTaskMap.get(t.id);
        return !existing || existing.label !== t.label || existing.order !== t.order || existing.isActive !== t.isActive;
      });
      if (changedTaskTypes.length > 0) {
        await api.putTimesheetTaskTypes(localTaskTypes as unknown as Record<string, unknown>[]);
      }
    }
    if (shouldMigrateProjects) {
      const changedProjects = localProjects.filter((p) => {
        const existing = apiProjectMap.get(p.id);
        if (!existing) return true;
        const aUsers = [...p.assignedUserIds].sort().join(',');
        const bUsers = [...existing.assignedUserIds].sort().join(',');
        const aTargets = JSON.stringify(p.taskTargetDays);
        const bTargets = JSON.stringify(existing.taskTargetDays);
        return (
          p.code !== existing.code ||
          p.name !== existing.name ||
          p.projectManagerId !== existing.projectManagerId ||
          p.isActive !== existing.isActive ||
          aUsers !== bUsers ||
          aTargets !== bTargets
        );
      });
      if (changedProjects.length > 0) {
        await Promise.all(changedProjects.map((p) => api.postTimesheetProject(p as unknown as Record<string, unknown>)));
      }
    }
    if (shouldMigrateEntries) {
      const changedEntries = localEntries.filter((e) => {
        const key = `${e.userId}|${e.date}|${e.projectId}|${e.taskType}`;
        const existing = apiEntryMap.get(key);
        if (!existing) return true;
        return existing.minutes !== e.minutes;
      });
      if (changedEntries.length > 0) {
        await Promise.all(changedEntries.map((e) => api.postTimesheetEntry(e)));
      }
    }
    const [tasksRes, projectsRes, entriesRes] = await Promise.all([
      api.getTimesheetTaskTypes(),
      api.getTimesheetProjects(),
      api.getTimesheetEntries(),
    ]);
    _timesheetTaskTypesCache = toArray(tasksRes as Record<string, unknown>[])
      .map(normalizeTimesheetTaskType)
      .filter((x): x is TimesheetTaskTypeDefinition => x !== null)
      .sort((a, b) => a.order - b.order);
    _timesheetProjectsCache = toArray(projectsRes as Record<string, unknown>[])
      .map(normalizeTimesheetProject)
      .filter((x): x is TimesheetProject => x !== null);
    _timesheetEntriesCache = toArray(entriesRes as Record<string, unknown>[])
      .map(normalizeTimesheetEntry)
      .filter((x): x is TimesheetEntry => x !== null)
      .sort((a, b) => (a.date === b.date ? b.updatedAt.localeCompare(a.updatedAt) : b.date.localeCompare(a.date)));
    console.log('[timesheet-migrate] localStorage data synced to API');
  } catch (err) {
    console.error('[timesheet-migrate] migration failed:', err);
  }
}

function normalizeAttendanceLatePolicy(raw: unknown): AttendanceLatePolicy {
  const normalizeTime = (v: unknown, fallback: string): string => {
    const s = String(v ?? '').trim();
    if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
    return fallback;
  };
  const normalizePenalty = (v: unknown, fallback: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(12, n);
  };
  const sortByAfter = (list: Array<{ after: string; penalty: number }>) =>
    [...list].sort((a, b) => a.after.localeCompare(b.after));

  if (!raw || typeof raw !== 'object') return DEFAULT_ATTENDANCE_LATE_POLICY;
  const o = raw as Record<string, unknown>;

  const tiersRaw = Array.isArray(o.tiers) ? o.tiers : [];
  const normalizedTiers = tiersRaw
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const t = x as Record<string, unknown>;
      return {
        after: normalizeTime(t.after, '09:30:00'),
        penalty: normalizePenalty(t.penalty, 0.25),
      };
    })
    .filter((t) => !!t.after);

  if (normalizedTiers.length > 0) {
    return { tiers: sortByAfter(normalizedTiers) };
  }

  // backward compatibility with old shape
  const lateAfter = normalizeTime(o.lateAfter, '09:30:00');
  const severeLateAfter = normalizeTime(o.severeLateAfter, '10:00:00');
  const penaltyNormal = normalizePenalty(o.penaltyNormal, 0.25);
  const penaltySevere = normalizePenalty(o.penaltySevere, 0.5);
  return {
    tiers: sortByAfter([
      { after: lateAfter, penalty: penaltyNormal },
      { after: severeLateAfter, penalty: penaltySevere },
    ]),
  };
}

export function getAttendanceLatePolicy(): AttendanceLatePolicy {
  const stored = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LATE_POLICY);
  const parsed = safeJsonParse<AttendanceLatePolicy | null>(stored, null);
  return normalizeAttendanceLatePolicy(parsed);
}

export function saveAttendanceLatePolicy(policy: AttendanceLatePolicy): void {
  const normalized = normalizeAttendanceLatePolicy(policy);
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LATE_POLICY, JSON.stringify(normalized));
}

export function calculateLatePenaltyDays(checkIn?: string): number {
  const policy = getAttendanceLatePolicy();
  if (!checkIn) return 0;
  let penalty = 0;
  for (const tier of policy.tiers) {
    if (checkIn > tier.after) penalty = tier.penalty;
  }
  return penalty;
}

export function getLateThresholdTime(): string {
  const policy = getAttendanceLatePolicy();
  return policy.tiers[0]?.after || DEFAULT_ATTENDANCE_LATE_POLICY.tiers[0].after;
}

/** แปลง quota keys จาก lowercase (จาก backend) เป็น UPPERCASE (ตาม LeaveTypeId ที่ frontend ใช้)
 *  Backend คืน { sick: 30, vacation: 12 } แต่ frontend ใช้ user.quotas['SICK'], user.quotas['VACATION']
 */
function normalizeQuotaKeys(raw: Record<string, unknown>): Record<string, number> {
  const KEY_MAP: Record<string, string> = {
    sick: 'SICK',
    vacation: 'VACATION',
    personal: 'PERSONAL',
    maternity: 'MATERNITY',
    sterilization: 'STERILIZATION',
    other: 'OTHER',
    ordination: 'ORDINATION',
    military: 'MILITARY',
    paternity: 'PATERNITY',
  };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = KEY_MAP[k.toLowerCase()] ?? k.toUpperCase();
    out[mapped] = Number(v) || 0;
  }
  return out;
}

/**
 * Normalize a user/entity ID to the consistent format used by the frontend.
 * Converts numeric IDs (integer or string) to zero-padded 3-digit strings
 * so that DB INTEGER 4, VARCHAR "4", and VARCHAR "004" all resolve to "004".
 */
export function normalizeUserId(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    return String(parseInt(s, 10)).padStart(3, '0');
  }
  return s;
}

/** ชื่อตำแหน่งตามรหัสพนักงาน (ต้นแบบเดียวกับ migration 008) — ใช้เมื่อ DB ยังเก็บ position ซ้ำกับ department */
const CANONICAL_POSITION_BY_USER_ID: Record<string, string> = {
  '001': 'Managing Director',
  '002': 'Software Development Manager',
  '003': 'Financial Director',
  '004': 'Project Manager',
  '005': 'Project Manager',
  '008': 'แม่บ้าน',
  '011': 'System Analyst',
  '012': 'Business Analyst',
  '013': 'Senior System Analyst',
  '017': 'Senior Programmer',
  '020': 'Quality Assurance',
  '021': 'Brand Strategic Manager',
  '023': 'Creative Designer',
  '025': 'Quality Assurance',
  '026': 'Programmer',
  '027': 'Sale Executive',
  '028': 'Programmer',
};

export function normalizeUser(u: Record<string, unknown>): User {
  const rawQuotas = (u.quotas && typeof u.quotas === 'object') ? (u.quotas as Record<string, unknown>) : {};
  const department = String(u.department ?? '').trim();
  let position = String(u.position ?? u.jobTitle ?? '').trim();
  const id = normalizeUserId(u.id ?? '');
  const canonical = CANONICAL_POSITION_BY_USER_ID[id];
  if (canonical && (!position || position === department)) {
    position = canonical;
  }
  return {
    id,
    name: String(u.name ?? ''),
    email: String(u.email ?? ''),
    password: '',
    role: (u.role as UserRole) ?? UserRole.EMPLOYEE,
    gender: (u.gender as Gender) ?? 'male',
    position,
    department,
    joinDate: String(u.joinDate ?? u.join_date ?? ''),
    managerId: u.managerId != null ? normalizeUserId(u.managerId) : (u.manager_id != null ? normalizeUserId(u.manager_id) : undefined),
    quotas: normalizeQuotaKeys(rawQuotas),
    isSuspended: u.isSuspended === true || u.is_suspended === true,
    failedLoginAttempts: u.failedLoginAttempts != null
      ? Number(u.failedLoginAttempts) || 0
      : (u.failed_login_attempts != null ? Number(u.failed_login_attempts) || 0 : 0),
  };
}
/**
 * แปลง ISO datetime string หรือ Date object เป็น "YYYY-MM-DD" เท่านั้น
 * แก้ปัญหา PostgreSQL DATE ที่ถูก serialize เป็น "2026-02-01T00:00:00.000Z"
 * ซึ่งเมื่อนำมาต่อด้วย "T12:00:00" จะกลายเป็น Invalid Date
 */
function toDateOnly(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s === 'undefined' || s === 'null') return '';
  const tIdx = s.indexOf('T');
  if (tIdx >= 0) return s.substring(0, tIdx);
  return s;
}

function normalizeLeaveRequest(r: Record<string, unknown>): LeaveRequest {
  const typeRaw = r.type ?? r.leave_type ?? '';
  const typeStr = (typeof typeRaw === 'string' && typeRaw ? typeRaw : String(typeRaw)).toUpperCase();
  return {
    id: String(r.id),
    userId: normalizeUserId(r.userId ?? r.user_id),
    userName: String(r.userName ?? r.user_name),
    type: typeStr,
    startDate: toDateOnly(r.startDate ?? r.start_date),
    endDate: toDateOnly(r.endDate ?? r.end_date),
    reason: String(r.reason ?? ''),
    status: (r.status as LeaveStatus) ?? LeaveStatus.PENDING,
    submittedAt: String(r.submittedAt ?? r.submitted_at ?? ''),
    reviewedAt: r.reviewedAt != null ? String(r.reviewedAt) : (r.reviewed_at != null ? String(r.reviewed_at) : undefined),
    managerComment: r.managerComment != null ? String(r.managerComment) : (r.manager_comment != null ? String(r.manager_comment) : undefined),
  };
}
function normalizeLeaveType(t: Record<string, unknown>): LeaveTypeDefinition {
  // Normalize ID to UPPERCASE so that DB lowercase ('sick','maternity') matches INITIAL_LEAVE_TYPES ('SICK','MATERNITY')
  const id = String(t.id ?? t.leave_type_id ?? '').toUpperCase();
  const labelRaw = t.label ?? t.name ?? t.leave_type_name ?? '';
  const label = (typeof labelRaw === 'string' && labelRaw) ? labelRaw : (labelRaw != null ? String(labelRaw) : '');
  // Fallback ค่าที่ backend ไม่มี (defaultQuota, order) จาก INITIAL_LEAVE_TYPES
  const initial = INITIAL_LEAVE_TYPES.find(x => x.id === id);
  return {
    id,
    label: label || initial?.label || '',
    // Backend ส่ง "applicable" ไม่ใช่ "applicableTo" — ต้องตรวจสอบทั้งคู่
    applicableTo: (t.applicableTo ?? t.applicable_to ?? t.applicable ?? initial?.applicableTo ?? 'both') as 'male' | 'female' | 'both',
    // Backend ไม่มี default_quota และ order — fallback จาก INITIAL_LEAVE_TYPES
    defaultQuota: t.defaultQuota != null ? Number(t.defaultQuota) : (t.default_quota != null ? Number(t.default_quota) : (initial?.defaultQuota ?? 0)),
    order: t.order != null ? Number(t.order) : (initial?.order ?? 0),
    isActive: t.isActive !== false && t.is_active !== false,
  };
}
function normalizeNotification(n: Record<string, unknown>): Notification {
  return {
    id: String(n.id),
    userId: normalizeUserId(n.userId ?? n.user_id),
    title: String(n.title),
    message: String(n.message),
    isRead: n.isRead === true || n.is_read === true,
    createdAt: String(n.createdAt ?? n.created_at ?? ''),
  };
}
function normalizeAttendance(r: Record<string, unknown>): AttendanceRecord {
  const checkIn = r.checkIn != null ? String(r.checkIn).slice(0, 8) : (r.check_in != null ? String(r.check_in).slice(0, 8) : undefined);
  const checkOut = r.checkOut != null ? String(r.checkOut).slice(0, 8) : (r.check_out != null ? String(r.check_out).slice(0, 8) : undefined);
  const lateThreshold = getLateThresholdTime();
  // ยึด policy ปัจจุบันเมื่อมี checkIn; ถ้าไม่มี checkIn ค่อย fallback ค่า isLate จาก backend
  const isLate = typeof checkIn === 'string'
    ? checkIn > lateThreshold
    : (r.isLate === true || r.is_late === true);
  return {
    id: String(r.id),
    userId: normalizeUserId(r.userId ?? r.user_id),
    date: toDateOnly(r.date),
    checkIn,
    checkOut,
    isLate,
    penaltyApplied: r.penaltyApplied === true || r.penalty_applied === true || isLate,
  };
}

/** แปลง response ที่อาจเป็น array หรือ { data: [] } / { records: [] } เป็น array */
function toArray<T = Record<string, unknown>>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o.records)) return o.records as T[];
    if (Array.isArray(o.users)) return o.users as T[];
    if (Array.isArray(o.leave_requests)) return o.leave_requests as T[];
    if (Array.isArray(o.leave_types)) return o.leave_types as T[];
  }
  return [];
}

/** แปลง response วันหยุดจาก backend เป็น Record<date, name> (รองรับทั้ง object และ array) */
function normalizeHolidaysResponse(raw: unknown): Record<string, string> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const d = (item as Record<string, unknown>).date ?? (item as Record<string, unknown>).holiday_date;
        const n = (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).holiday_name;
        if (d != null && n != null) out[String(d)] = String(n);
      }
    }
    return out;
  }
  return {};
}

/** โหลดข้อมูลจาก API (เรียกเมื่อเปิดแอปในโหมด Supabase) — รองรับ multi-user */
export async function loadFromApi(): Promise<void> {
  if (!isApiMode()) return;
  const [usersRes, typesRes, requestsRes, holidaysRes, tsTasksRes, tsProjectsRes, tsEntriesRes] = await Promise.allSettled([
    api.getUsers(),
    api.getLeaveTypes(),
    api.getLeaveRequests(),
    api.getHolidays(),
    api.getTimesheetTaskTypes(),
    api.getTimesheetProjects(),
    api.getTimesheetEntries(),
  ]);

  if (usersRes.status === 'rejected') {
    console.error('[loadFromApi] getUsers failed:', usersRes.reason);
    // If API requires auth (not logged in yet), keep demo users available from localStorage.
    invalidateUsersCache();
  } else {
    const users = toArray(usersRes.value as Record<string, unknown>[]).map(normalizeUser);
    setUsersCache(users);
  }
  if (typesRes.status === 'rejected') {
    console.error('[loadFromApi] getLeaveTypes failed:', typesRes.reason);
  } else if (typesRes.status === 'fulfilled') {
    const typesList = toArray(typesRes.value as Record<string, unknown>[]).map(normalizeLeaveType);
    _leaveTypesCache = typesList.length > 0 ? normalizeLeaveTypeList(typesList) : INITIAL_LEAVE_TYPES;
  }
  if (requestsRes.status === 'rejected') {
    console.error('[loadFromApi] getLeaveRequests failed:', requestsRes.reason);
  } else {
    const list = toArray(requestsRes.value as Record<string, unknown>[]).map(normalizeLeaveRequest);
    _leaveRequestsCache = list;
    _leaveRequestsByIdCache = new Map(list.map(r => [r.id, r]));
  }
  if (holidaysRes.status === 'rejected') {
    console.error('[loadFromApi] getHolidays failed:', holidaysRes.reason);
  } else if (holidaysRes.status === 'fulfilled') {
    _holidaysCache = normalizeHolidaysResponse(holidaysRes.value as Record<string, unknown>);
  }
  if (tsTasksRes.status === 'rejected') {
    console.error('[loadFromApi] getTimesheetTaskTypes failed:', tsTasksRes.reason);
  } else {
    const list = toArray(tsTasksRes.value as Record<string, unknown>[])
      .map(normalizeTimesheetTaskType)
      .filter((x): x is TimesheetTaskTypeDefinition => x !== null)
      .sort((a, b) => a.order - b.order);
    _timesheetTaskTypesCache = list.length > 0 ? list : DEFAULT_TIMESHEET_TASK_TYPES;
  }
  if (tsProjectsRes.status === 'rejected') {
    console.error('[loadFromApi] getTimesheetProjects failed:', tsProjectsRes.reason);
  } else {
    _timesheetProjectsCache = toArray(tsProjectsRes.value as Record<string, unknown>[])
      .map(normalizeTimesheetProject)
      .filter((x): x is TimesheetProject => x !== null);
  }
  if (tsEntriesRes.status === 'rejected') {
    console.error('[loadFromApi] getTimesheetEntries failed:', tsEntriesRes.reason);
  } else {
    _timesheetEntriesCache = toArray(tsEntriesRes.value as Record<string, unknown>[])
      .map(normalizeTimesheetEntry)
      .filter((x): x is TimesheetEntry => x !== null)
      .sort((a, b) => (a.date === b.date ? b.updatedAt.localeCompare(a.updatedAt) : b.date.localeCompare(a.date)));
  }
  await migrateLocalTimesheetToApiIfNeeded(
    _timesheetTaskTypesCache ?? [],
    _timesheetProjectsCache ?? [],
    _timesheetEntriesCache ?? []
  );
}

export async function loadAttendanceForUser(userId: string): Promise<void> {
  if (!isApiMode()) return;
  const prev = _attendanceCache.get(userId) ?? [];
  try {
    const res = await api.getAttendance(userId);
    _attendanceCache.set(userId, (res as Record<string, unknown>[]).map(normalizeAttendance));
  } catch {
    // Keep last known data to avoid random row count drops on transient API errors.
    _attendanceCache.set(userId, prev);
  }
}

export async function loadNotificationsForUser(userId: string): Promise<void> {
  if (!isApiMode()) return;
  try {
    const res = await api.getNotifications(userId);
    const list = (res as Record<string, unknown>[]).map(normalizeNotification);
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    _notificationsCache.set(userId, list);
  } catch {
    _notificationsCache.set(userId, []);
  }
}

const INITIAL_LEAVE_TYPES: LeaveTypeDefinition[] = [
  { id: 'SICK', label: 'ลาป่วย', applicableTo: 'both', defaultQuota: 30, order: 1, isActive: true },
  { id: 'VACATION', label: 'ลาพักร้อน', applicableTo: 'both', defaultQuota: 12, order: 2, isActive: true },
  { id: 'PERSONAL', label: 'ลากิจ', applicableTo: 'both', defaultQuota: 3, order: 3, isActive: true },
  { id: 'MATERNITY', label: 'ลาคลอด', applicableTo: 'female', defaultQuota: 90, order: 4, isActive: true },
  { id: 'STERILIZATION', label: 'ลาทำหมัน', applicableTo: 'female', defaultQuota: 999, order: 5, isActive: true },
  { id: 'PATERNITY', label: 'ลาเลี้ยงบุตร (ชาย)', applicableTo: 'male', defaultQuota: 15, order: 6, isActive: true },
  { id: 'ORDINATION', label: 'ลาบวช', applicableTo: 'male', defaultQuota: 120, order: 7, isActive: true },
  { id: 'MILITARY', label: 'ลาเกณฑ์ทหาร', applicableTo: 'male', defaultQuota: 60, order: 8, isActive: true },
  { id: 'OTHER', label: 'ลาอื่นๆ', applicableTo: 'both', defaultQuota: 0, order: 9, isActive: true },
];

function getInitialQuotasForGender(gender: Gender): Record<string, number> {
  const q: Record<string, number> = {};
  INITIAL_LEAVE_TYPES.filter(t => t.isActive && (t.applicableTo === gender || t.applicableTo === 'both')).forEach(t => { q[t.id] = t.defaultQuota; });
  return q;
}

function buildQuotasFromLeaveTypes(gender: Gender): Record<string, number> {
  const types = getLeaveTypes().filter(t => t.isActive && (t.applicableTo === gender || t.applicableTo === 'both'));
  const q: Record<string, number> = {};
  types.forEach(t => { q[t.id] = t.defaultQuota; });
  return q;
}

// Leave Types (จัดการโดย Admin)
/** normalize leave type list ให้ id เป็น UPPERCASE และตัดรายการซ้ำตาม id — เหลือแบบละ 1 รายการ */
function normalizeLeaveTypeList(list: LeaveTypeDefinition[]): LeaveTypeDefinition[] {
  const normalized = list.map(t => ({ ...t, id: t.id.toUpperCase() }));
  const seen = new Set<string>();
  return normalized.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export const getLeaveTypes = (): LeaveTypeDefinition[] => {
  if (isApiMode() && _leaveTypesCache) return _leaveTypesCache; // cache ผ่าน normalizeLeaveType แล้ว (uppercase)
  const stored = localStorage.getItem(STORAGE_KEYS.LEAVE_TYPES);
  if (!stored) {
    localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(INITIAL_LEAVE_TYPES));
    return INITIAL_LEAVE_TYPES;
  }
  const parsed = safeJsonParse<LeaveTypeDefinition[]>(stored, []);
  // normalize ก่อน return เพื่อรับมือกับ localStorage ที่อาจมี id lowercase จากเวอร์ชันเก่า
  const list = Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_LEAVE_TYPES;
  return normalizeLeaveTypeList(list);
};

export const saveLeaveTypes = (types: LeaveTypeDefinition[]): void | Promise<void> => {
  if (isApiMode()) {
    const deduped = normalizeLeaveTypeList(types);
    const promise = api.putLeaveTypes(deduped as unknown as Record<string, unknown>[])
      .then((res) => {
        const list = (res as Record<string, unknown>[]).map(normalizeLeaveType);
        _leaveTypesCache = normalizeLeaveTypeList(list);
      })
      .catch(() => {});
    return promise as Promise<void>;
  }
  const deduped = normalizeLeaveTypeList(types);
  localStorage.setItem(STORAGE_KEYS.LEAVE_TYPES, JSON.stringify(deduped));
};

/** ประเภทวันลาที่ใช้กับเพศนี้ (เรียงตาม order) */
export const getLeaveTypesForGender = (gender: Gender): LeaveTypeDefinition[] => {
  return getLeaveTypes()
    .filter(t => t.isActive && (t.applicableTo === gender || t.applicableTo === 'both'))
    .sort((a, b) => a.order - b.order);
};

export const addLeaveType = (data: Omit<LeaveTypeDefinition, 'id' | 'order'>): LeaveTypeDefinition | Promise<LeaveTypeDefinition> => {
  const types = getLeaveTypes();
  const maxOrder = types.length ? Math.max(...types.map(t => t.order)) : 0;
  const id = 'LT' + Date.now();
  const newType: LeaveTypeDefinition = { ...data, id, order: maxOrder + 1 };
  const result = saveLeaveTypes([...types, newType]);
  if (result != null && typeof (result as Promise<void>).then === 'function') {
    return (result as Promise<void>).then(() => newType);
  }
  return newType;
};

export const updateLeaveType = (id: string, data: Partial<LeaveTypeDefinition>): void | Promise<void> => {
  const types = getLeaveTypes();
  const updated = types.map(t => t.id === id ? { ...t, ...data } : t);
  return saveLeaveTypes(updated);
};

export const deleteLeaveType = (id: string): void | Promise<void> => {
  const types = getLeaveTypes();
  return saveLeaveTypes(types.map(t => t.id === id ? { ...t, isActive: false } : t));
};

export const getDefaultQuotaForLeaveType = (leaveTypeId: string): number => {
  const t = getLeaveTypes().find(x => x.id === leaveTypeId);
  return t?.defaultQuota ?? 0;
};

/** สร้าง User[] จาก CONNEX_Data.csv — ใช้เป็นข้อมูลตั้งต้นหลังล้างข้อมูล */
function buildInitialUsersFromConnex(): User[] {
  const rows = parseConnexCSV();
  return rows.map(row => {
    const joinDate = thaiDateToISODate(row.startDate) || row.startDate;
    const gender = inferGenderFromName(row.name);
    let role = UserRole.EMPLOYEE;
    if (row.id === '001' || row.position === 'Managing Director') role = UserRole.ADMIN;
    else if (row.position.includes('Director') || row.position === 'Project Manager' || row.position.includes('Manager')) role = UserRole.MANAGER;
    const managerId = (row.under && row.under.trim() !== '' && row.under !== row.id) ? row.under.trim() : undefined;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      role,
      gender,
      // CSV มี Position เป็น "ชื่อตำแหน่ง" จริง (เช่น Senior System Analyst)
      position: row.position,
      // CSV ไม่มีคอลัมน์ Department/แผนก — ให้เริ่มเป็นค่าว่าง แล้ว Admin กรอกเองภายหลัง
      department: '',
      joinDate,
      managerId,
      quotas: getInitialQuotasForGender(gender),
    };
  });
}

// ข้อมูลตั้งต้นจาก CONNEX_Data.csv; เพศจากคำนำหน้า (นาย=ชาย, นาง/นางสาว=หญิง)
const INITIAL_USERS: User[] = buildInitialUsersFromConnex();

function inferGenderFromName(name: string): Gender {
  return name.startsWith('นาย') ? 'male' : 'female';
}

/** สร้าง map managerId -> [ลูกทีมโดยตรง] ในหนึ่งรอบ O(n) */
function buildManagerToChildrenMap(users: User[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const u of users) {
    const mid = u.managerId ?? '';
    if (!map.has(mid)) map.set(mid, []);
    map.get(mid)!.push(u.id);
  }
  return map;
}

/** รายชื่อ id พนักงานทั้งหมดในสายงาน (รวมลูกทีมของลูกทีม) — O(n) ด้วย BFS จาก map ที่สร้างครั้งเดียว */
export function getSubordinateIdsRecursive(managerId: string, users: User[]): string[] {
  if (users.length === 0) return [];
  const map = buildManagerToChildrenMap(users);
  const result: string[] = [];
  const queue: string[] = map.get(managerId) ?? [];
  let i = 0;
  while (i < queue.length) {
    const id = queue[i++];
    result.push(id);
    const children = map.get(id);
    if (children) for (const c of children) queue.push(c);
  }
  return result;
}

/** สำหรับกรองคำขอแบบ O(1) ต่อรายการ — ใช้ Set แทน array.includes */
export function getSubordinateIdSetRecursive(managerId: string, users: User[]): Set<string> {
  const arr = getSubordinateIdsRecursive(managerId, users);
  return new Set(arr);
}

let _usersCache: User[] | null = null;
let _usersByIdCache: Map<string, User> | null = null;
export function invalidateUsersCache(): void {
  _usersCache = null;
  _usersByIdCache = null;
}

function setUsersCache(normalized: User[]): void {
  _usersCache = normalized;
  _usersByIdCache = new Map(normalized.map(u => [u.id, u]));
}

export const getAllUsers = (): User[] => {
  if (isApiMode() && _usersCache !== null) return _usersCache;
  if (_usersCache) return _usersCache;
  const stored = localStorage.getItem(STORAGE_KEYS.USERS);
  if (!stored) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
    setUsersCache(INITIAL_USERS);
    return INITIAL_USERS;
  }
  const parsed = safeJsonParse<User[]>(stored, []);
  if (!Array.isArray(parsed)) {
    setUsersCache(INITIAL_USERS);
    return INITIAL_USERS;
  }
  // ถ้าข้อมูลใน localStorage ถูกล้าง/กลายเป็น array ว่าง ให้ fallback ไปใช้รายชื่อ demo ตั้งต้น
  // เพื่อไม่ให้หน้า Login (Demo Access) ว่างเปล่า
  if (parsed.length === 0) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
    setUsersCache(INITIAL_USERS);
    return INITIAL_USERS;
  }
  const normalized = parsed.map(u => ({
    ...u,
    gender: u.gender ?? inferGenderFromName(u.name),
    position: (u as User).position ?? u.department ?? '',
    quotas: typeof u.quotas === 'object' && u.quotas !== null ? u.quotas : buildQuotasFromLeaveTypes(u.gender ?? inferGenderFromName(u.name)),
    isSuspended: (u as User).isSuspended === true,
    failedLoginAttempts: (u as User).failedLoginAttempts != null ? Number((u as User).failedLoginAttempts) || 0 : 0,
  }));
  setUsersCache(normalized);
  return normalized;
};

export const updateUser = (updatedUser: User): void | Promise<void> => {
  if (isApiMode()) {
    const toApiQuotas = (raw: unknown): Record<string, number> => {
      if (!raw || typeof raw !== 'object') return {};
      const src = raw as Record<string, unknown>;
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(src)) {
        const n = Number(value);
        out[key.toLowerCase()] = Number.isFinite(n) ? n : 0;
      }
      return out;
    };
    const body = {
      ...updatedUser,
      quotas: toApiQuotas(updatedUser.quotas),
    } as Record<string, unknown>;
    if (body.password === '') delete body.password;

    // Optimistic update: reflect changes immediately in cache
    const prev = getAllUsers();
    const optimistic = prev.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
    setUsersCache(optimistic);

    const promise = api.putUser(updatedUser.id, body)
      .then(() => api.getUsers())
      .then((res) => {
        setUsersCache((res as Record<string, unknown>[]).map(normalizeUser));
      })
      .catch((err) => {
        // rollback
        setUsersCache(prev);
        throw err;
      });

    const current = getInitialUser();
    if (current && current.id === updatedUser.id) saveCurrentUser(updatedUser);
    return promise as Promise<void>;
  }
  const users = getAllUsers();
  const updatedList = users.map(u => u.id === updatedUser.id ? updatedUser : u);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedList));
  invalidateUsersCache();
  const current = getInitialUser();
  if (current && current.id === updatedUser.id) saveCurrentUser(updatedUser);
};

/** สร้างรหัสพนักงานใหม่ (เลข 3 หลักต่อจากที่มีอยู่) */
function generateNextUserId(users: User[]): string {
  const numericIds = users.map(u => parseInt(u.id, 10)).filter(n => !isNaN(n));
  const next = numericIds.length ? Math.max(...numericIds) + 1 : 1;
  return String(next).padStart(3, '0');
}

export const addUser = (data: Omit<User, 'id'>): User | Promise<User> => {
  const users = getAllUsers();
  const id = generateNextUserId(users);
  const quotas = data.quotas && Object.keys(data.quotas).length > 0 ? data.quotas : buildQuotasFromLeaveTypes(data.gender);
  const newUser: User = { ...data, id, quotas };
  if (isApiMode()) {
    const toApiQuotas = (raw: unknown): Record<string, number> => {
      if (!raw || typeof raw !== 'object') return {};
      const src = raw as Record<string, unknown>;
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(src)) {
        const n = Number(value);
        out[key.toLowerCase()] = Number.isFinite(n) ? n : 0;
      }
      return out;
    };
    const body = {
      id,
      ...newUser,
      quotas: toApiQuotas(newUser.quotas),
      password: (data as User).password || 'changeme',
      joinDate: newUser.joinDate,
    };
    return api.postUser(body as unknown as Record<string, unknown>)
      .then(() => api.getUsers())
      .then((res) => {
        const normalized = (res as Record<string, unknown>[]).map(normalizeUser);
        setUsersCache(normalized);
        return normalized.find((u) => u.id === id) ?? newUser;
      });
  }
  const updated = [...users, newUser];
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
  invalidateUsersCache();
  return newUser;
};

/** ลบพนักงาน (เช่น ลาออก) — ถ้าเป็นผู้ใช้ที่ล็อกอินอยู่จะออกจากระบบ */
export const deleteUser = (userId: string): boolean | Promise<boolean> => {
  const users = getAllUsers();
  if (users.length <= 1) return false;
  if (isApiMode()) {
    const current = getInitialUser();
    if (current?.id === userId) logoutUser();
    return api.deleteUser(userId)
      .then(() => api.getUsers())
      .then((res) => {
        setUsersCache((res as Record<string, unknown>[]).map(normalizeUser));
        return true;
      })
      .catch(() => false);
  }
  const updated = users.filter(u => u.id !== userId);
  if (updated.length === users.length) return false;
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
  invalidateUsersCache();
  const current = getInitialUser();
  if (current?.id === userId) logoutUser();
  return true;
};

/** OWASP: Session must not store credentials. We store only non-sensitive user fields and resolve full user from list.
 * ใช้ sessionStorage แยกตามแท็บ — แท็บอื่นล็อกอินเป็นคนอื่นจะไม่เขียนทับ session ของแท็บนี้ จึงไม่ทำให้รายการหายเมื่อ refresh อัตโนมัติ */
export const getInitialUser = (): User | null => {
  const stored = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  const session = safeJsonParse<Pick<User, 'id'>>(stored, null);
  if (!session?.id) return null;
  getAllUsers();
  return _usersByIdCache?.get(session.id) ?? null;
};

/** OWASP: Do not persist password in session storage. */
export const saveCurrentUser = (user: User) => {
  const { password: _, ...sessionUser } = user;
  sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(sessionUser));
};

export const logoutUser = () => {
  sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  if (isApiMode()) api.clearToken();
};

/**
 * ลบข้อมูลเดิมทั้งหมดและเตรียมให้โหลดข้อมูลตั้งต้นใหม่
 * หลังเรียกแล้วให้ reload หน้า จะได้รายชื่อ 20 คน + วันหยุด + ไม่มีคำขอลา/การลงเวลา
 */
export const resetAllData = () => {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  invalidateUsersCache();
  invalidateLeaveRequestsCache();
};

// Attendance
export const getAttendanceRecords = (userId?: string): AttendanceRecord[] => {
  if (isApiMode() && userId) return _attendanceCache.get(userId) ?? [];
  const stored = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
  const parsed = safeJsonParse<AttendanceRecord[]>(stored, []);
  const records = Array.isArray(parsed) ? parsed : [];
  return userId ? records.filter(r => r.userId === userId) : records;
};

function getLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeTimesheetTaskType(raw: unknown): TimesheetTaskTypeDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim();
  const label = String(o.label ?? '').trim();
  if (!id || !label) return null;
  const orderRaw = Number(o.order);
  return {
    id,
    label,
    order: Number.isFinite(orderRaw) ? orderRaw : 0,
    isActive: o.isActive !== false,
  };
}

export const getTimesheetTaskTypes = (): TimesheetTaskTypeDefinition[] => {
  if (isApiMode() && _timesheetTaskTypesCache) return _timesheetTaskTypesCache;
  const stored = localStorage.getItem(STORAGE_KEYS.TIMESHEET_TASK_TYPES);
  const parsed = safeJsonParse<unknown[]>(stored, []);
  const list = Array.isArray(parsed) ? parsed : [];
  const normalized = list
    .map(normalizeTimesheetTaskType)
    .filter((x): x is TimesheetTaskTypeDefinition => x !== null);
  if (normalized.length === 0) return DEFAULT_TIMESHEET_TASK_TYPES;
  return normalized.sort((a, b) => a.order - b.order);
};

export const saveTimesheetTaskTypes = (types: TimesheetTaskTypeDefinition[]): void => {
  const normalized = types
    .map(normalizeTimesheetTaskType)
    .filter((x): x is TimesheetTaskTypeDefinition => x !== null)
    .sort((a, b) => a.order - b.order);
  if (isApiMode()) {
    _timesheetTaskTypesCache = normalized;
    api.putTimesheetTaskTypes(normalized as unknown as Record<string, unknown>[])
      .then((res) => {
        const list = toArray(res as Record<string, unknown>[])
          .map(normalizeTimesheetTaskType)
          .filter((x): x is TimesheetTaskTypeDefinition => x !== null)
          .sort((a, b) => a.order - b.order);
        _timesheetTaskTypesCache = list.length > 0 ? list : normalized;
      })
      .catch((err) => console.error('[saveTimesheetTaskTypes] API failed:', err));
  }
  localStorage.setItem(STORAGE_KEYS.TIMESHEET_TASK_TYPES, JSON.stringify(normalized));
};

function sanitizeMinutes(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(24 * 60, Math.round(v));
}

function normalizeTimesheetProject(raw: unknown): TimesheetProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim();
  const code = String(o.code ?? '').trim();
  const name = String(o.name ?? '').trim();
  const managerId = normalizeUserId(o.projectManagerId ?? o.project_manager_id ?? '');
  if (!id || !code || !name || !managerId) return null;
  const assignedRaw = Array.isArray(o.assignedUserIds) ? o.assignedUserIds : (Array.isArray(o.assigned_user_ids) ? o.assigned_user_ids : []);
  const assignedUserIds = assignedRaw.map((x) => normalizeUserId(x)).filter(Boolean);
  const taskDefs = getTimesheetTaskTypes().filter((t) => t.isActive);
  const targetRaw = (o.taskTargetDays && typeof o.taskTargetDays === 'object')
    ? (o.taskTargetDays as Record<string, unknown>)
    : ((o.task_target_days && typeof o.task_target_days === 'object') ? (o.task_target_days as Record<string, unknown>) : {});
  const taskTargetDays: Record<string, number> = {};
  for (const task of taskDefs) {
    const n = Number(targetRaw[task.id]);
    taskTargetDays[task.id] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  for (const [k, v] of Object.entries(targetRaw)) {
    if (taskTargetDays[k] != null) continue;
    const n = Number(v);
    taskTargetDays[k] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return {
    id,
    code,
    name,
    taskTargetDays,
    assignedUserIds: Array.from(new Set(assignedUserIds)),
    projectManagerId: managerId,
    isActive: o.isActive !== false,
  };
}

function normalizeTimesheetEntry(raw: unknown): TimesheetEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim();
  const userId = normalizeUserId(o.userId ?? o.user_id ?? '');
  const date = toDateOnly(o.date ?? o.entry_date ?? '');
  const projectId = String(o.projectId ?? o.project_id ?? '').trim();
  const taskType = String(o.taskType ?? o.task_type_id ?? '').trim();
  if (!id || !userId || !date || !projectId || !taskType) return null;
  return {
    id,
    userId,
    date,
    projectId,
    taskType,
    minutes: sanitizeMinutes(Number(o.minutes ?? 0)),
    updatedAt: String(o.updatedAt ?? o.updated_at ?? new Date().toISOString()),
  };
}

export const getTimesheetProjects = (): TimesheetProject[] => {
  if (isApiMode() && _timesheetProjectsCache) return _timesheetProjectsCache;
  const stored = localStorage.getItem(STORAGE_KEYS.TIMESHEET_PROJECTS);
  const parsed = safeJsonParse<unknown[]>(stored, []);
  const list = Array.isArray(parsed) ? parsed : [];
  return list
    .map(normalizeTimesheetProject)
    .filter((x): x is TimesheetProject => x !== null);
};

export const saveTimesheetProjects = (projects: TimesheetProject[]): void => {
  if (isApiMode()) {
    const normalized = projects
      .map(normalizeTimesheetProject)
      .filter((x): x is TimesheetProject => x !== null);
    _timesheetProjectsCache = normalized;
  }
  localStorage.setItem(STORAGE_KEYS.TIMESHEET_PROJECTS, JSON.stringify(projects));
};

export const upsertTimesheetProject = (project: TimesheetProject): TimesheetProject => {
  const normalized = normalizeTimesheetProject(project);
  if (!normalized) {
    throw new Error('ข้อมูลโครงการไม่ถูกต้อง');
  }
  const projects = getTimesheetProjects();
  const idx = projects.findIndex((p) => p.id === normalized.id);
  if (idx >= 0) {
    projects[idx] = normalized;
  } else {
    projects.push(normalized);
  }
  if (isApiMode()) {
    _timesheetProjectsCache = projects;
    api.postTimesheetProject(normalized as unknown as Record<string, unknown>)
      .then((res) => {
        const saved = normalizeTimesheetProject(res as Record<string, unknown>);
        if (!saved) return;
        const current = _timesheetProjectsCache ?? [];
        const i = current.findIndex((p) => p.id === saved.id);
        if (i >= 0) current[i] = saved;
        else current.push(saved);
        _timesheetProjectsCache = [...current];
      })
      .catch((err) => console.error('[upsertTimesheetProject] API failed:', err));
  }
  saveTimesheetProjects(projects);
  return normalized;
};

export const getTimesheetEntries = (userId?: string): TimesheetEntry[] => {
  if (isApiMode() && _timesheetEntriesCache) {
    if (!userId) return _timesheetEntriesCache;
    const uid = normalizeUserId(userId);
    return _timesheetEntriesCache.filter((e) => normalizeUserId(e.userId) === uid);
  }
  const stored = localStorage.getItem(STORAGE_KEYS.TIMESHEET_ENTRIES);
  const parsed = safeJsonParse<unknown[]>(stored, []);
  const list = Array.isArray(parsed) ? parsed : [];
  const normalized = list
    .map(normalizeTimesheetEntry)
    .filter((x): x is TimesheetEntry => x !== null)
    .sort((a, b) => (a.date === b.date ? b.updatedAt.localeCompare(a.updatedAt) : b.date.localeCompare(a.date)));
  if (!userId) return normalized;
  const uid = normalizeUserId(userId);
  return normalized.filter((e) => normalizeUserId(e.userId) === uid);
};

export const getTimesheetProjectsForUser = (userId: string): TimesheetProject[] => {
  const uid = normalizeUserId(userId);
  return getTimesheetProjects().filter((p) => p.isActive && p.assignedUserIds.includes(uid));
};

export const saveTimesheetEntry = (payload: {
  userId: string;
  date: string;
  projectId: string;
  taskType: string;
  minutes: number;
}): TimesheetEntry => {
  const userId = normalizeUserId(payload.userId);
  const date = String(payload.date || '').trim();
  const projectId = String(payload.projectId || '').trim();
  const taskType = String(payload.taskType || '').trim();
  const today = getLocalDateString(new Date());
  if (!userId || !isValidDateString(date) || !projectId || !taskType) {
    throw new Error('ข้อมูลลงเวลาไม่ถูกต้อง');
  }
  if (date > today) {
    throw new Error('ไม่สามารถลง Timesheet ล่วงหน้าได้ (เลือกได้เฉพาะวันนี้หรือย้อนหลัง)');
  }
  const entries = getTimesheetEntries();
  const minutes = sanitizeMinutes(payload.minutes);
  const updatedAt = new Date().toISOString();
  const sameIdx = entries.findIndex((e) =>
    e.userId === userId &&
    e.date === date &&
    e.projectId === projectId &&
    e.taskType === taskType
  );
  const next: TimesheetEntry = {
    id: sameIdx >= 0 ? entries[sameIdx].id : Math.random().toString(36).substring(2, 11),
    userId,
    date,
    projectId,
    taskType,
    minutes,
    updatedAt,
  };
  if (sameIdx >= 0) {
    entries[sameIdx] = next;
  } else {
    entries.unshift(next);
  }
  if (isApiMode()) {
    _timesheetEntriesCache = entries;
    api.postTimesheetEntry(next)
      .then((res) => {
        const saved = normalizeTimesheetEntry(res as Record<string, unknown>);
        if (!saved) return;
        const current = _timesheetEntriesCache ?? [];
        const i = current.findIndex((e) =>
          e.userId === saved.userId &&
          e.date === saved.date &&
          e.projectId === saved.projectId &&
          e.taskType === saved.taskType
        );
        if (i >= 0) current[i] = saved;
        else current.unshift(saved);
        _timesheetEntriesCache = [...current].sort((a, b) => (a.date === b.date ? b.updatedAt.localeCompare(a.updatedAt) : b.date.localeCompare(a.date)));
      })
      .catch((err) => console.error('[saveTimesheetEntry] API failed:', err));
  }
  localStorage.setItem(STORAGE_KEYS.TIMESHEET_ENTRIES, JSON.stringify(entries));
  return next;
};

export const getTimesheetEntriesByDate = (userId: string, date: string): TimesheetEntry[] => {
  const uid = normalizeUserId(userId);
  return getTimesheetEntries(uid).filter((e) => e.date === date);
};

export const saveAttendance = (userId: string, type: 'IN' | 'OUT'): AttendanceRecord => {
  const records = getAttendanceRecords();
  const now = new Date();
  const dateStr = getLocalDateString(now);
  const timeStr = now.toLocaleTimeString('th-TH', { hour12: false });
  
  let record = records.find(r => r.userId === userId && r.date === dateStr);
  getAllUsers();
  const user = _usersByIdCache?.get(userId);
  const lateThreshold = getLateThresholdTime();

  if (!record) {
    const isLate = type === 'IN' && timeStr > lateThreshold;
    record = {
      id: Math.random().toString(36).substring(2, 11),
      userId,
      date: dateStr,
      checkIn: type === 'IN' ? timeStr : undefined,
      checkOut: type === 'OUT' ? timeStr : undefined,
      isLate,
      penaltyApplied: false
    };

    if (isLate && user) {
      const penaltyDays = calculateLatePenaltyDays(timeStr);
      const vac = user.quotas['VACATION'] ?? getDefaultQuotaForLeaveType('VACATION');
      user.quotas['VACATION'] = Math.max(0, vac - penaltyDays);
      updateUser(user);
      record.penaltyApplied = true;
      
      createNotification({
        userId,
        title: 'แจ้งเตือนการเข้างานสาย',
        message: `คุณเข้างานเวลา ${timeStr} ซึ่งเกินกำหนด ${lateThreshold.slice(0, 5)} น. ระบบได้หักโควต้าลาพักร้อน ${penaltyDays} วันอัตโนมัติ`,
      });

      // Notify Manager
      if (user.managerId) {
        createNotification({
          userId: user.managerId,
          title: 'แจ้งเตือนพนักงานเข้าสาย',
          message: `${user.name} เข้างานสายเมื่อเวลา ${timeStr} (หักโควต้า ${penaltyDays} วัน)`,
        });
      }
    }
    
    records.unshift(record);
  } else {
    if (type === 'IN') {
      // Allow rewriting today's check-in time when user presses IN again
      record.checkIn = timeStr;
      // Start a new IN/OUT cycle: clear prior checkout of the same day
      record.checkOut = undefined;
      record.isLate = timeStr > lateThreshold;
      if (record.isLate && !record.penaltyApplied && user) {
        const penaltyDays = calculateLatePenaltyDays(timeStr);
        const vac = user.quotas['VACATION'] ?? getDefaultQuotaForLeaveType('VACATION');
        user.quotas['VACATION'] = Math.max(0, vac - penaltyDays);
        updateUser(user);
        record.penaltyApplied = true;
        createNotification({
          userId,
          title: 'แจ้งเตือนการเข้างานสาย',
          message: `คุณเข้างานเวลา ${timeStr} ซึ่งเกินกำหนด ${lateThreshold.slice(0, 5)} น. ระบบได้หักโควต้าลาพักร้อน ${penaltyDays} วันอัตโนมัติ`,
        });

        if (user.managerId) {
          createNotification({
            userId: user.managerId,
            title: 'แจ้งเตือนพนักงานเข้าสาย',
            message: `${user.name} เข้างานสายเมื่อเวลา ${timeStr} (หักโควต้า ${penaltyDays} วัน)`,
          });
        }
      }
    } else if (type === 'OUT') {
      // OUT can also be rewritten for today's record
      record.checkOut = timeStr;
    }
  }

  if (isApiMode()) {
    return api.postAttendance(userId, type)
      .then((data) => {
        const updated = normalizeAttendance(data as Record<string, unknown>);
        const current = _attendanceCache.get(userId) ?? [];
        const idx = current.findIndex((r) => r.date === updated.date);
        if (idx >= 0) {
          const next = [...current];
          next[idx] = { ...next[idx], ...updated };
          _attendanceCache.set(userId, next);
        } else {
          _attendanceCache.set(userId, [updated, ...current]);
        }
        return updated;
      }) as Promise<AttendanceRecord>;
  }
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(records));
  return record;
};

// Leave Requests (cache เพื่อลดการ parse ซ้ำเมื่อข้อมูลใหญ่)
let _leaveRequestsCache: LeaveRequest[] | null = null;
let _leaveRequestsByIdCache: Map<string, LeaveRequest> | null = null;
export function invalidateLeaveRequestsCache(): void {
  _leaveRequestsCache = null;
  _leaveRequestsByIdCache = null;
}

export const getLeaveRequests = (): LeaveRequest[] => {
  if (isApiMode() && _leaveRequestsCache !== null) return _leaveRequestsCache;
  if (_leaveRequestsCache) return _leaveRequestsCache;
  if (isApiMode()) return [];
  const stored = localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS);
  const parsed = safeJsonParse<LeaveRequest[]>(stored, []);
  const list = Array.isArray(parsed) ? parsed : [];
  _leaveRequestsCache = list;
  _leaveRequestsByIdCache = new Map(list.map(r => [r.id, r]));
  return list;
};

/** โหมด API: โหลดคำขอลาของ manager + ลูกทีมทั้งหมด แล้ว merge เข้า cache (ใช้สำหรับสรุปรายงาน/ปฏิทิน)
 *  หมายเหตุ: จะไม่เขียนทับ cache ด้วยข้อมูลว่าง เพื่อป้องกัน cache ถูก clear โดยไม่ตั้งใจ */
export async function loadLeaveRequestsForManager(managerId: string): Promise<void> {
  if (!isApiMode()) return;
  const allUsers = getAllUsers();
  const subordinateIds = getSubordinateIdsRecursive(managerId, allUsers);

  // ถ้าไม่พบลูกทีม (อาจเป็นเพราะ managerId ไม่ match หรือข้อมูลยังไม่โหลด) → โหลดทั้งหมดแทน
  if (subordinateIds.length === 0) {
    try {
      const all = await api.getLeaveRequests();
      const list = toArray(all).map(normalizeLeaveRequest);
      if (list.length > 0) {
        _leaveRequestsCache = list;
        _leaveRequestsByIdCache = new Map(list.map((r) => [r.id, r]));
      }
    } catch {
      // เก็บ cache เดิม
    }
    return;
  }

  const idsToFetch = [managerId, ...subordinateIds];
  try {
    const results = await Promise.all(idsToFetch.map((id) => api.getLeaveRequests(id)));
    const merged = results.flatMap((r) => toArray(r));
    const list = merged.map((r) => normalizeLeaveRequest(r));
    // เฉพาะกรณีได้ข้อมูลมาจริง จึงอัปเดต cache — ป้องกันการ clear cache โดยไม่ตั้งใจ
    if (list.length > 0) {
      // Merge กับ cache เดิม (preserve ข้อมูลที่อาจโหลดมาจาก loadFromApi แล้ว)
      const existingById = new Map(_leaveRequestsCache?.map((r) => [r.id, r]) ?? []);
      const newById = new Map(list.map((r) => [r.id, r]));
      const merged2 = new Map([...existingById, ...newById]);
      _leaveRequestsCache = Array.from(merged2.values());
      _leaveRequestsByIdCache = new Map(_leaveRequestsCache.map((r) => [r.id, r]));
    }
  } catch {
    try {
      const all = await api.getLeaveRequests();
      const list = toArray(all).map(normalizeLeaveRequest);
      if (list.length > 0) {
        _leaveRequestsCache = list;
        _leaveRequestsByIdCache = new Map(list.map((r) => [r.id, r]));
      }
    } catch {
      // เก็บ cache เดิมถ้าโหลดไม่สำเร็จ
    }
  }
}

/** ลาป่วยยื่นย้อนหลังเท่านั้น — วันที่เริ่ม/สิ้นสุดต้องไม่เกินวันนี้ */
function getTodayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ช่วงวันสองช่วงซ้อนทับกันหรือไม่ (ใช้กับวันลา) */
function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export type SaveLeaveRequestResult = { ok: true; savedToServer?: boolean } | { ok: false; error: string };

/** OWASP: Validate all inputs (type, date format, length) before persist. ไม่อนุญาตให้ช่วงวันลาซ้อนทับกับรายการที่รออนุมัติหรืออนุมัติแล้วของพนักงานคนเดียวกัน */
export const saveLeaveRequest = async (data: Omit<LeaveRequest, 'id' | 'status' | 'submittedAt'>): Promise<SaveLeaveRequestResult> => {
  console.log('🔵 [store.ts] saveLeaveRequest:', data);
  const typeIds = getLeaveTypes().filter(t => t.isActive).map(t => t.id);
  if (!isValidLeaveTypeId(data.type, typeIds)) return { ok: false, error: 'ประเภทวันลาไม่ถูกต้อง' };
  if (!isValidDateString(data.startDate) || !isValidDateString(data.endDate)) return { ok: false, error: 'รูปแบบวันที่ไม่ถูกต้อง' };
  if (new Date(data.startDate) > new Date(data.endDate)) return { ok: false, error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' };
  if (data.type === 'SICK') {
    const todayStr = getTodayYMD();
    if (data.startDate > todayStr || data.endDate > todayStr) return { ok: false, error: 'ลาป่วยต้องยื่นย้อนหลังเท่านั้น' };
  }

  const requests = getLeaveRequests();
  const existingSameUser = requests.filter(
    r => r.userId === data.userId && (r.status === LeaveStatus.PENDING || r.status === LeaveStatus.APPROVED)
  );
  const overlaps = existingSameUser.some(r => dateRangesOverlap(data.startDate, data.endDate, r.startDate, r.endDate));
  if (overlaps) {
    return { ok: false, error: 'ช่วงวันลาซ้อนทับกับรายการลาที่มีอยู่แล้ว (รออนุมัติหรืออนุมัติแล้ว) กรุณาเลือกช่วงวันอื่น' };
  }

  const reason = String(data.reason ?? '').trim().slice(0, MAX_REASON_LENGTH);
  const userName = String(data.userName ?? '').trim().slice(0, 200);

  const newRequest: LeaveRequest = {
    ...data,
    reason,
    userName,
    id: Math.random().toString(36).substring(2, 11),
    status: LeaveStatus.PENDING,
    submittedAt: new Date().toISOString(),
  };

  if (isApiMode()) {
    console.log('🟢 [store.ts] ใช้โหมด API, กำลังส่งคำขอลา...');
    try {
      await api.postLeaveRequest({
        userId: newRequest.userId,
        userName: newRequest.userName,
        type: newRequest.type,
        startDate: newRequest.startDate,
        endDate: newRequest.endDate,
        reason: newRequest.reason,
      });
      const res = await api.getLeaveRequests();
      const list = toArray(res).map(normalizeLeaveRequest);
      _leaveRequestsCache = list;
      _leaveRequestsByIdCache = new Map(list.map(r => [r.id, r]));
      console.log('✅ [store.ts] อัพเดท cache สำเร็จ:', list.length, 'รายการ');
      
      getAllUsers();
      const employee = _usersByIdCache?.get(data.userId);
      if (employee?.managerId) {
        await api.postNotification(employee.managerId, 'คำขอลาใหม่จากพนักงาน', `${data.userName} ได้ส่งคำขอลาประเภท ${data.type} ตั้งแต่วันที่ ${data.startDate}`).catch(() => {});
      }
      return { ok: true, savedToServer: true };
    } catch (err) {
      console.error('❌ [store.ts] บันทึกคำขอลาไป Supabase ไม่สำเร็จ:', err);
      return { ok: false, error: 'ไม่สามารถบันทึกคำขอลาได้ กรุณาลองใหม่' };
    }
  }

  const updated = [newRequest, ...requests];
  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(updated));
  invalidateLeaveRequestsCache();
  getAllUsers();
  const employee = _usersByIdCache?.get(data.userId);
  if (employee?.managerId) {
    createNotification({
      userId: employee.managerId,
      title: 'คำขอลาใหม่จากพนักงาน',
      message: `${data.userName} ได้ส่งคำขอลาประเภท ${data.type} ตั้งแต่วันที่ ${data.startDate}`,
    });
  }
  return { ok: true, savedToServer: false };
};

/** OWASP: Validate id/status, sanitize managerComment length. Access control: อนุญาตเฉพาะผู้บังคับบัญชาของพนักงานที่ยื่นคำขอเท่านั้น */
export const updateRequestStatus = (id: string, status: LeaveStatus, managerComment: string, managerId: string) => {
  const request = _leaveRequestsByIdCache?.get(id);
  if (!request) return;
  if (![LeaveStatus.APPROVED, LeaveStatus.REJECTED].includes(status)) return;

  if (isApiMode()) {
    const comment = String(managerComment ?? '').trim().slice(0, MAX_MANAGER_COMMENT_LENGTH);
    api.patchLeaveRequestStatus(id, status, comment, managerId).then(() => api.getLeaveRequests()).then((res) => {
      const list = toArray(res).map(normalizeLeaveRequest);
      _leaveRequestsCache = list;
      _leaveRequestsByIdCache = new Map(list.map(r => [r.id, r]));
    }).catch(() => {});
    api.postNotification(request.userId, status === LeaveStatus.APPROVED ? 'คำขอลาได้รับการอนุมัติ' : 'คำขอลาถูกปฏิเสธ', `คำขอลาช่วงวันที่ ${request.startDate} ของคุณได้รับการพิจารณาแล้ว: ${status === LeaveStatus.APPROVED ? 'อนุมัติ' : 'ไม็นุมัติ'}`).catch(() => {});
    return;
  }

  getAllUsers();
  const employee = _usersByIdCache?.get(request.userId);
  if (!employee || employee.managerId !== managerId) return;
  const requests = getLeaveRequests();
  const comment = String(managerComment ?? '').trim().slice(0, MAX_MANAGER_COMMENT_LENGTH);
  const updated = requests.map(r =>
    r.id === id ? { ...r, status, managerComment: comment, reviewedAt: new Date().toISOString() } : r
  );
  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(updated));
  invalidateLeaveRequestsCache();
  createNotification({
    userId: request.userId,
    title: status === LeaveStatus.APPROVED ? 'คำขอลาได้รับการอนุมัติ' : 'คำขอลาถูกปฏิเสธ',
    message: `คำขอลาช่วงวันที่ ${request.startDate} ของคุณได้รับการพิจารณาแล้ว: ${status === LeaveStatus.APPROVED ? 'อนุมัติ' : 'ไม็นุมัติ'}`,
  });
};

// Notifications
export const getNotifications = (userId: string): Notification[] => {
  if (isApiMode()) return _notificationsCache.get(userId) ?? [];
  const stored = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  const parsed = safeJsonParse<Notification[]>(stored, []);
  const allNotifs = Array.isArray(parsed) ? parsed : [];
  return allNotifs.filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const createNotification = (data: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
  if (isApiMode()) {
    api.postNotification(data.userId, data.title, data.message).then(() => loadNotificationsForUser(data.userId)).catch(() => {});
    return;
  }
  const stored = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  const parsed = safeJsonParse<Notification[]>(stored, []);
  const allNotifs = Array.isArray(parsed) ? parsed : [];
  const newNotif: Notification = {
    ...data,
    id: Math.random().toString(36).substring(2, 11),
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([newNotif, ...allNotifs]));
};

/** OWASP: Access control - only allow marking notifications that belong to the given userId. */
export const markNotifAsRead = (id: string, userId: string) => {
  if (isApiMode()) {
    api.patchNotificationRead(id, userId).then(() => loadNotificationsForUser(userId)).catch(() => {});
    return;
  }
  const stored = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  const allNotifs = safeJsonParse<Notification[]>(stored, []);
  const list = Array.isArray(allNotifs) ? allNotifs : [];
  const updated = list.map(n =>
    n.id === id && n.userId === userId ? { ...n, isRead: true } : n
  );
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
};

// Holidays
export const getHolidays = (): Record<string, string> => {
  if (isApiMode() && _holidaysCache) return _holidaysCache;
  const stored = localStorage.getItem(STORAGE_KEYS.HOLIDAYS);
  if (!stored) {
    localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(HOLIDAYS_2026));
    return HOLIDAYS_2026;
  }
  const parsed = safeJsonParse<Record<string, string>>(stored, {});
  return typeof parsed === 'object' && parsed !== null ? parsed : HOLIDAYS_2026;
};

/** OWASP: Validate date format and name length. โหมด API คืน Promise ให้รอแล้วอัปเดต UI ได้ */
export function saveHoliday(date: string, name: string): void | Promise<void> {
  if (!isValidDateString(date)) return;
  const safeName = String(name ?? '').trim().slice(0, MAX_HOLIDAY_NAME_LENGTH);
  if (!safeName) return;
  console.log('🔵 [store.ts] saveHoliday:', { date, safeName, isApiMode: isApiMode(), VITE_API_URL: import.meta.env.VITE_API_URL });
  if (isApiMode()) {
    console.log('🟢 [store.ts] ใช้โหมด API, กำลังเรียก backend...');
    // Merge กับข้อมูลเก่า (จาก cache ถ้ามี หรือ fallback ไป localStorage)
    const current = _holidaysCache || getHolidays();
    const prev = _holidaysCache ? { ..._holidaysCache } : {};
    _holidaysCache = { ...current, [date]: safeName };
    return api.postHoliday(date, safeName)
      .then(() => {
        console.log('✅ [store.ts] POST holiday สำเร็จ, กำลังดึงข้อมูลใหม่...');
        return api.getHolidays();
      })
      .then((res) => {
        console.log('✅ [store.ts] GET holidays สำเร็จ:', res);
        _holidaysCache = normalizeHolidaysResponse(res);
      })
      .catch((err) => {
        console.error('❌ [store.ts] บันทึกวันหยุดไป Supabase ไม่สำเร็จ:', err);
        _holidaysCache = Object.keys(prev).length ? prev : null;
      });
  }
  console.log('🟡 [store.ts] ใช้โหมด localStorage');
  const current = getHolidays();
  current[date] = safeName;
  localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(current));
}

export function deleteHoliday(date: string): void | Promise<void> {
  if (isApiMode()) {
    const prev = _holidaysCache ? { ..._holidaysCache } : null;
    if (_holidaysCache) {
      const next = { ..._holidaysCache };
      delete next[date];
      _holidaysCache = Object.keys(next).length ? next : null;
    }
    return api.deleteHoliday(date)
      .then(() => api.getHolidays())
      .then((res) => {
        _holidaysCache = normalizeHolidaysResponse(res);
      })
      .catch((err) => {
        _holidaysCache = prev;
        console.error('ลบวันหยุดบน Supabase ไม่สำเร็จ:', err);
      });
  }
  const current = getHolidays();
  delete current[date];
  localStorage.setItem(STORAGE_KEYS.HOLIDAYS, JSON.stringify(current));
}
