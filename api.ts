/**
 * Client สำหรับเรียก Backend API เมื่อใช้โหมด Supabase (VITE_API_URL)
 * Multi-user: หลัง login เก็บ token ใน sessionStorage และส่งใน Authorization ทุก request
 */

const PROD_BACKEND_URL = 'https://connex-leave-flow-doak.vercel.app';
const PREVIEW_BACKEND_URL = typeof import.meta !== 'undefined' && import.meta.env?.VITE_PREVIEW_API_URL
  ? String(import.meta.env.VITE_PREVIEW_API_URL).trim().replace(/\/$/, '')
  : '';
const VERCEL_ENV = typeof import.meta !== 'undefined' && import.meta.env?.VERCEL_ENV
  ? String(import.meta.env.VERCEL_ENV).trim().toLowerCase()
  : '';

function getEffectiveApiBase(): string {
  const fromEnv = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? String(import.meta.env.VITE_API_URL).trim().replace(/\/$/, '')
    : '';
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    const origin = window.location.origin.replace(/\/$/, '');
    // Support both the main alias and generated Vercel preview domains for this frontend project.
    const isConnexFrontendHost = /^connex-leave-flow(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(host);
    if (isConnexFrontendHost && (!fromEnv || fromEnv === origin || fromEnv.includes('connex-leave-flow.vercel.app'))) {
      // For Preview deployments, point to preview backend only (do not fall back to production backend).
      if (VERCEL_ENV === 'preview') return PREVIEW_BACKEND_URL;
      return PROD_BACKEND_URL;
    }
  }
  return fromEnv;
}

const API_BASE = getEffectiveApiBase();

const TOKEN_KEY = 'hr_api_token';

/** ใช้แยกกรณี error จาก API (เช่น 500 = เซิร์ฟเวอร์/DB ขัดข้อง) เพื่อแสดงข้อความให้ผู้ใช้ถูกต้อง */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getErrorMessage(res: Response, data: Record<string, unknown>): string {
  const msg = (data?.error ?? data?.message ?? data?.msg) as string | undefined;
  if (msg && typeof msg === 'string') return msg;
  if (res.status === 401) return 'กรุณาเข้าสู่ระบบใหม่';
  if (res.status === 403) return 'ไม่มีสิทธิ์ดำเนินการ';
  if (res.status >= 500) return 'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่';
  return 'เกิดข้อผิดพลาด';
}

export function getApiBase(): string {
  return API_BASE;
}

export function isApiMode(): boolean {
  return !!API_BASE;
}

export function getToken(): string | null {
  return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Event name เมื่อ backend ตอบ 401 เพราะ user ไป login ที่ device อื่น (ให้ device นี้แสดง alert และ logout) */
export const SESSION_REPLACED_EVENT = 'sessionReplaced';

async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    res.clone().json().then((data: Record<string, unknown>) => {
      if (data?.code === 'SESSION_REPLACED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(SESSION_REPLACED_EVENT, { detail: data }));
        }
      }
    }).catch(() => {});
  }
  return res;
}

/** เช็กว่า session ยังเป็นล่าสุดหรือไม่ (ใช้เมื่อมีกิจกรรม เช่น ขยับเมาส์ — ถ้า login จาก device อื่นจะได้ 401 และ trigger SESSION_REPLACED_EVENT พร้อม detail) */
export async function getSessionCheck(): Promise<void> {
  await fetchWithAuth(`${API_BASE}/api/auth/session-check`);
}

export async function login(email: string, password: string): Promise<{ user: Record<string, unknown>; token: string }> {
  let res: Response;
  try {
    res = await fetchWithAuth(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ติดต่อเซิร์ฟเวอร์ไม่ได้';
    throw new ApiError(msg, 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = getErrorMessage(res, data) || 'ล็อกอินไม่สำเร็จ';
    throw new ApiError(msg, res.status);
  }
  const data = await res.json() as { token?: string; user?: Record<string, unknown> };
  if (data?.token && data?.user) return { user: data.user, token: data.token };
  throw new ApiError('รูปแบบตอบกลับไม่ถูกต้อง', 0);
}

/** เช็กสถานะ Backend และการเชื่อมต่อ DB (ใช้แสดงข้อความเมื่อติดต่อฐานข้อมูลไม่ได้) */
export async function getBackendStatus(): Promise<{ server: boolean; database: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/api/status`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({})) as { server?: boolean; database?: boolean; message?: string };
  if (!res.ok) {
    const msg = data?.message || `Backend ตอบ ${res.status}`;
    throw new Error(msg);
  }
  return { server: !!data?.server, database: !!data?.database, message: data?.message };
}

export async function getUsers(): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/users`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดผู้ใช้ไม่สำเร็จ');
  }
  return res.json();
}

export async function getLeaveTypes(): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/leave-types`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดประเภทวันลาไม่สำเร็จ');
  }
  return res.json();
}

export async function getLeaveRequests(userId?: string): Promise<Record<string, unknown>[]> {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const res = await fetchWithAuth(`${API_BASE}/api/leave-requests${q}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดคำขอลาไม่สำเร็จ');
  }
  return res.json();
}

export async function postLeaveRequest(body: {
  userId: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/leave-requests`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ยื่นคำขอลาไม่สำเร็จ');
  }
  return res.json();
}

export async function patchLeaveRequestStatus(
  id: string,
  status: string,
  managerComment: string,
  managerId?: string
): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/leave-requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, managerComment, managerId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'อัปเดตสถานะไม่สำเร็จ');
  }
  return res.json();
}

export async function getHolidays(): Promise<Record<string, string> | unknown> {
  const res = await fetchWithAuth(`${API_BASE}/api/holidays`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดวันหยุดไม่สำเร็จ');
  }
  return res.json();
}

export async function postHoliday(date: string, name: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/holidays`, {
    method: 'POST',
    body: JSON.stringify({ date, name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'บันทึกวันหยุดไม่สำเร็จ');
  }
}

export async function deleteHoliday(date: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/holidays/${date}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ลบวันหยุดไม่สำเร็จ');
  }
}

/** ตรวจว่า client อยู่บนเครือข่ายออฟฟิศหรือไม่ (สำหรับปุ่มตรวจสอบเครือข่ายก่อนลงเวลา) */
export async function getAttendanceVerifyNetwork(): Promise<{ allowed: boolean; clientIp?: string }> {
  const res = await fetchWithAuth(`${API_BASE}/api/attendance/verify-network`);
  const data = (await res.json().catch(() => ({}))) as { allowed?: boolean; clientIp?: string };
  return { allowed: data.allowed === true, clientIp: data.clientIp };
}

export async function getAttendance(userId?: string): Promise<Record<string, unknown>[]> {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const res = await fetchWithAuth(`${API_BASE}/api/attendance${q}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดการลงเวลาไม่สำเร็จ');
  }
  return res.json();
}

export async function postAttendance(userId: string, type: 'IN' | 'OUT'): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/attendance`, {
    method: 'POST',
    body: JSON.stringify({ userId, type }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ลงเวลาไม่สำเร็จ');
  }
  return res.json();
}

export async function getTimesheetTaskTypes(): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/timesheet/task-types`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดประเภทงาน Timesheet ไม่สำเร็จ');
  }
  return res.json();
}

export async function putTimesheetTaskTypes(types: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/timesheet/task-types`, {
    method: 'PUT',
    body: JSON.stringify(types),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'บันทึกประเภทงาน Timesheet ไม่สำเร็จ');
  }
  return res.json();
}

export async function getTimesheetProjects(): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/timesheet/projects`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดโครงการ Timesheet ไม่สำเร็จ');
  }
  return res.json();
}

export async function postTimesheetProject(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/timesheet/projects`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'บันทึกโครงการ Timesheet ไม่สำเร็จ');
  }
  return res.json();
}

export async function getTimesheetEntries(params?: { userId?: string; date?: string; projectId?: string }): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams();
  if (params?.userId) q.set('userId', params.userId);
  if (params?.date) q.set('date', params.date);
  if (params?.projectId) q.set('projectId', params.projectId);
  const query = q.toString();
  const res = await fetchWithAuth(`${API_BASE}/api/timesheet/entries${query ? `?${query}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดรายการ Timesheet ไม่สำเร็จ');
  }
  return res.json();
}

export async function postTimesheetEntry(body: {
  id?: string;
  userId: string;
  date: string;
  projectId: string;
  taskType: string;
  minutes: number;
}): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/timesheet/entries`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'บันทึก Timesheet ไม่สำเร็จ');
  }
  return res.json();
}

export async function getNotifications(userId: string): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดการแจ้งเตือนไม่สำเร็จ');
  }
  return res.json();
}

export async function postNotification(userId: string, title: string, message: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications`, {
    method: 'POST',
    body: JSON.stringify({ userId, title, message }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'สร้างการแจ้งเตือนไม่สำเร็จ');
  }
}

export async function patchNotificationRead(id: string, userId: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/notifications/${id}/read?userId=${encodeURIComponent(userId)}`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'อัปเดตการแจ้งเตือนไม่สำเร็จ');
  }
}

export async function postUser(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/users`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'สร้างผู้ใช้ไม่สำเร็จ');
  }
  return res.json();
}

export async function putUser(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'อัปเดตผู้ใช้ไม่สำเร็จ');
  }
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ลบผู้ใช้ไม่สำเร็จ');
  }
}

export async function postRecalculateVacationQuotaCurrent(userId?: string): Promise<{ updatedCount: number; users: Record<string, unknown>[] }> {
  const body = userId ? { userId } : undefined;
  const res = await fetchWithAuth(`${API_BASE}/api/users/recalculate-vacation-quota-current`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ประมวลผลโควต้าลาพักร้อนไม่สำเร็จ');
  }
  const data = await res.json().catch(() => ({})) as { updatedCount?: unknown; users?: unknown };
  return {
    updatedCount: Number(data.updatedCount) || 0,
    users: Array.isArray(data.users) ? (data.users as Record<string, unknown>[]) : [],
  };
}

export async function putLeaveTypes(types: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/leave-types`, {
    method: 'PUT',
    body: JSON.stringify(types),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'อัปเดตประเภทวันลาไม่สำเร็จ');
  }
  return res.json();
}

export async function patchLeaveType(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/leave-types/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'อัปเดตประเภทวันลาไม่สำเร็จ');
  }
  return res.json();
}

export async function getExpenseTypes(): Promise<Record<string, unknown>[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/types`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดประเภทค่าใช้จ่ายไม่สำเร็จ');
  }
  return res.json();
}

export async function postExpenseType(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/types`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'บันทึกประเภทค่าใช้จ่ายไม่สำเร็จ');
  }
  return res.json();
}

export async function deleteExpenseType(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/types/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ลบประเภทค่าใช้จ่ายไม่สำเร็จ');
  }
}

export async function getExpenseClaims(params?: { from?: string; to?: string; scope?: 'mine' | 'subordinates' | 'all' }): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.scope) q.set('scope', params.scope);
  const query = q.toString();
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/claims${query ? `?${query}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดรายการเบิกไม่สำเร็จ');
  }
  return res.json();
}

export async function getExpenseClaimById(id: string): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/claims/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'โหลดรายละเอียดใบเบิกไม่สำเร็จ');
  }
  return res.json();
}

export async function postExpenseClaim(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/claims`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'บันทึกใบเบิกไม่สำเร็จ');
  }
  return res.json();
}

export async function approveExpenseClaim(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/claims/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'อนุมัติใบเบิกไม่สำเร็จ');
  }
}

export async function setExpenseClaimPayDate(id: string, paidDate: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/claims/${encodeURIComponent(id)}/pay-date`, {
    method: 'POST',
    body: JSON.stringify({ paidDate }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'กำหนดวันทำจ่ายไม่สำเร็จ');
  }
}

export async function rejectExpenseClaim(id: string, reason: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/claims/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ไม่สามารถ Reject ใบเบิกได้');
  }
}

export async function submitExpenseClaim(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/api/expenses/claims/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ไม่สามารถ Submit ใบเบิกได้');
  }
}
