/**
 * Client สำหรับเรียก Backend API เมื่อใช้โหมด Supabase (VITE_API_URL)
 * Multi-user: หลัง login เก็บ token ใน sessionStorage และส่งใน Authorization ทุก request
 */

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
  : '';

const TOKEN_KEY = 'hr_api_token';

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

async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) clearToken();
  return res;
}

export async function login(email: string, password: string): Promise<{ user: Record<string, unknown>; token: string }> {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(getErrorMessage(res, data) || 'ล็อกอินไม่สำเร็จ');
  }
  const data = await res.json() as { token?: string; user?: Record<string, unknown> };
  if (data?.token && data?.user) return { user: data.user, token: data.token };
  throw new Error('รูปแบบตอบกลับไม่ถูกต้อง');
}

/** เช็กสถานะ Backend และการเชื่อมต่อ DB (ใช้แสดงข้อความเมื่อติดต่อฐานข้อมูลไม่ได้) */
export async function getBackendStatus(): Promise<{ server: boolean; database: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/api/status`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Backend ไม่ตอบสนอง');
  const data = await res.json() as { server?: boolean; database?: boolean; message?: string };
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
