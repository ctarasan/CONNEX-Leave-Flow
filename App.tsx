
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, UserRole, LeaveRequest, Notification, LeaveStatus, AttendanceRecord, ExpenseClaim } from './types';
import { getInitialUser, getLeaveRequests, getNotifications, getAllUsers, getAttendanceRecords, getLeaveTypesForGender, getLeaveTypes, getHolidays, logoutUser, getSubordinateIdSetRecursive, loadFromApi, loadAttendanceForUser, loadNotificationsForUser, loadLeaveRequestsForManager, normalizeUserId, calculateLatePenaltyDays } from './store';
import { isApiMode, getBackendStatus, getApiBase, SESSION_REPLACED_EVENT, getSessionCheck, getExpenseClaimById, getExpenseClaims, getExpenseTypes } from './api';
import LeaveForm from './components/LeaveForm';
import PendingApprovalsBoard from './components/PendingApprovalsBoard';
import NotificationCenter from './components/NotificationCenter';
import ReportSummary from './components/ReportSummary';
import AdminPanel from './components/AdminPanel';
import AttendanceModule from './components/AttendanceModule';
import TeamAttendance from './components/TeamAttendance';
import VacationLedger from './components/VacationLedger';
import TimesheetModule from './components/TimesheetModule';
import ProjectTimesheetReport from './components/ProjectTimesheetReport';
import ExpenseModule from './components/ExpenseModule';
import Login from './components/Login';
import { STATUS_LABELS, STATUS_COLORS, HOLIDAYS_2026, APP_TITLE_WITH_VERSION, APP_LAST_UPDATED } from './constants';
import { todayLocalYmd, formatYmdAsDdMmBe, formatBangkokDateAsDdMmBe, formatTimeAsHm } from './utils';
import { useAlert } from './AlertContext';
import { BarChart3, Clock3, History, Home, ReceiptText, Settings2 } from 'lucide-react';

/** ประเภทวันลาที่แสดงบนแดชบอร์ดโดย default: ลาป่วย ลาพักร้อน ลากิจ */
const DEFAULT_DASHBOARD_LEAVE_IDS = ['SICK', 'VACATION', 'PERSONAL'];
const normalizeId = (raw: unknown): string => normalizeUserId(raw);

const App: React.FC = () => {
  const { showConfirm, showAlert } = useAlert();
  const [currentUser, setCurrentUser] = useState<User | null>(getInitialUser());
  const [apiLoading, setApiLoading] = useState(isApiMode());
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [myExpenseClaims, setMyExpenseClaims] = useState<ExpenseClaim[]>([]);
  const [expenseTypeLabelMap, setExpenseTypeLabelMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attendance' | 'history' | 'expense' | 'report' | 'admin'>('dashboard');
  const [attendanceSubTab, setAttendanceSubTab] = useState<'attendance' | 'timesheet'>('attendance');
  const [historySubTab, setHistorySubTab] = useState<'leave' | 'attendance' | 'vacation'>('leave');
  const [reportSubTab, setReportSubTab] = useState<'leave' | 'team' | 'project'>('leave');
  /** แดชบอร์ด: แสดงเฉพาะ ลาป่วย ลาพักร้อน ลากิจ โดย default; ใช้ลิงก์ "ดูทุกประเภทวันลา" เพื่อแสดงที่เหลือ */
  const [showAllDashboardLeaveTypes, setShowAllDashboardLeaveTypes] = useState(false);
  /** ตัวนับเพื่อ force reportRequests ให้ recompute จาก cache หลัง loadLeaveRequestsForManager หรือ loadFromApi เสร็จ */
  const [reportTick, setReportTick] = useState(0);
  /** โหมด API: เป็น true เมื่อติดต่อ Backend/ฐานข้อมูลไม่ได้ — แสดงข้อความบนหน้า Login */
  const [dbUnavailable, setDbUnavailable] = useState(false);
  /** เหตุผลที่ติดต่อไม่ได้ (เพื่อแสดงใน UI และดีบัก) */
  const [dbUnavailableReason, setDbUnavailableReason] = useState<string | null>(null);

  const calculateBusinessDays = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (start > end) return 0;

    let count = 0;
    const curDate = new Date(start.getTime());
    while (curDate <= end) {
      const dayOfWeek = curDate.getDay();
      const isoDate = curDate.toISOString().split('T')[0];
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = !!getHolidays()[isoDate];
      if (!isWeekend && !isHoliday) count++;
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  };

  const calculateWorkedHours = (rec: AttendanceRecord): string => {
    if (!rec.checkIn || !rec.checkOut) return '-';
    const inHm = formatTimeAsHm(rec.checkIn);
    const outHm = formatTimeAsHm(rec.checkOut);
    if (inHm === '-' || outHm === '-') return '-';

    const [inH, inM] = inHm.split(':').map(Number);
    const [outH, outM] = outHm.split(':').map(Number);
    if (![inH, inM, outH, outM].every((n) => Number.isFinite(n))) return '-';

    const inMinutes = inH * 60 + inM;
    const outMinutes = outH * 60 + outM;
    let diffMinutes = outMinutes - inMinutes;
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    if (diffMinutes <= 0) return '-';

    if (diffMinutes < 60) return `${diffMinutes} นาที`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours} ชม. ${minutes} นาที`;
  };

  const fetchData = useCallback((options?: { forceReplaceRequests?: boolean }) => {
    const updatedUser = getInitialUser();
    if (updatedUser) setCurrentUser(updatedUser);

    if (!updatedUser) return;

    const run = () => {
      const allRequests = getLeaveRequests();
      const allNotifs = getNotifications(updatedUser!.id);
      const allAttendance = getAttendanceRecords(updatedUser!.id);
      const allUsers = getAllUsers();

      if (updatedUser!.role === UserRole.ADMIN) {
        setRequests(allRequests);
      } else if (updatedUser!.role === UserRole.MANAGER) {
        const subordinateSet = getSubordinateIdSetRecursive(updatedUser!.id, allUsers);
        const normalizedSubordinateSet = new Set(Array.from(subordinateSet).map((id) => normalizeId(id)));
        let managedRequests = allRequests.filter((request) => normalizedSubordinateSet.has(normalizeId(request.userId)));
        // Fallback: ถ้า hierarchy ใน DB ยังไม่ได้ตั้งค่า ลอง direct managerId match
        if (managedRequests.length === 0 && allRequests.length > 0) {
          const directSubIds = new Set(
            allUsers
              .filter((u) => normalizeId(u.managerId) === normalizeId(updatedUser!.id))
              .map((u) => normalizeId(u.id))
          );
          if (directSubIds.size > 0) {
            managedRequests = allRequests.filter((request) => directSubIds.has(normalizeId(request.userId)));
          }
        }
        setRequests(prev => {
          if (!options?.forceReplaceRequests && managedRequests.length === 0 && prev.length > 0) return prev;
          return managedRequests;
        });
      } else {
        const myRequests = allRequests.filter((r) => normalizeId(r.userId) === normalizeId(updatedUser!.id));
        setRequests(prev => {
          if (!options?.forceReplaceRequests && myRequests.length === 0 && prev.length > 0) return prev;
          return myRequests;
        });
      }

      setNotifications(allNotifs);
      setAttendanceHistory(allAttendance);
      if (isApiMode()) {
        getExpenseTypes()
          .then((list) => {
            const map: Record<string, string> = {};
            for (const raw of list) {
              const id = String((raw as Record<string, unknown>).id ?? '').trim();
              const label = String((raw as Record<string, unknown>).label ?? '').trim();
              if (id) map[id] = label || id;
            }
            setExpenseTypeLabelMap(map);
          })
          .catch(() => setExpenseTypeLabelMap({}));

        getExpenseClaims({ scope: 'mine' })
          .then(async (raw) => {
            const mineBasics = raw
              .map((x) => ({
                id: String(x.id ?? ''),
                requesterId: String(x.requesterId ?? ''),
                requesterName: String(x.requesterName ?? ''),
                approverId: x.approverId ? String(x.approverId) : undefined,
                approverName: x.approverName ? String(x.approverName) : undefined,
                status: String(x.status ?? 'DRAFT') as ExpenseClaim['status'],
                claimDate: String(x.claimDate ?? ''),
                submittedAt: x.submittedAt ? String(x.submittedAt) : undefined,
                approvedAt: x.approvedAt ? String(x.approvedAt) : undefined,
                rejectedAt: x.rejectedAt ? String(x.rejectedAt) : undefined,
                rejectReason: x.rejectReason ? String(x.rejectReason) : undefined,
                paidDate: x.paidDate ? String(x.paidDate) : undefined,
                paidById: x.paidById ? String(x.paidById) : undefined,
                paidByName: x.paidByName ? String(x.paidByName) : undefined,
                paidSetAt: x.paidSetAt ? String(x.paidSetAt) : undefined,
                adminNote: x.adminNote ? String(x.adminNote) : undefined,
                projectSummary: x.projectSummary ? String(x.projectSummary) : '-',
                detailSummary: x.detailSummary ? String(x.detailSummary) : '-',
                items: [] as ExpenseClaim['items'],
                totalAmount: Number(x.totalAmount ?? 0),
                createdAt: String(x.createdAt ?? ''),
                updatedAt: String(x.updatedAt ?? ''),
              }))
              .filter((c) => normalizeId(c.requesterId) === normalizeId(updatedUser!.id));

            const mine = await Promise.all(
              mineBasics.map(async (c) => {
                try {
                  const detail = await getExpenseClaimById(c.id);
                  const items = Array.isArray(detail.items)
                    ? detail.items.map((it) => ({
                        id: String((it as Record<string, unknown>).id ?? ''),
                        expenseDate: String((it as Record<string, unknown>).expenseDate ?? ''),
                        projectId: String((it as Record<string, unknown>).projectId ?? ''),
                        expenseTypeId: String((it as Record<string, unknown>).expenseTypeId ?? ''),
                        detail: String((it as Record<string, unknown>).detail ?? ''),
                        amount: Number((it as Record<string, unknown>).amount ?? 0),
                      }))
                    : [];
                  return { ...c, items };
                } catch {
                  return c;
                }
              })
            );
            setMyExpenseClaims(mine);
          })
          .catch(() => setMyExpenseClaims([]));
      } else {
        setMyExpenseClaims([]);
        setExpenseTypeLabelMap({});
      }
    };

    if (isApiMode() && updatedUser.role === UserRole.MANAGER) {
      run();
      loadLeaveRequestsForManager(updatedUser.id).then(run);
      return;
    }
    run();
  }, []);

  useEffect(() => {
    if (isApiMode()) {
      setDbUnavailable(false);
      setDbUnavailableReason(null);
      const bootUser = getInitialUser();
      const bootPromise = bootUser
        ? loadFromApi().then(() => {
            setCurrentUser(getInitialUser());
            const u = getInitialUser();
            if (u) {
              return Promise.all([loadAttendanceForUser(u.id), loadNotificationsForUser(u.id)]).then(() => {
                fetchData({ forceReplaceRequests: true });
                setReportTick(t => t + 1);
              });
            }
            fetchData({ forceReplaceRequests: true });
            setReportTick(t => t + 1);
          })
        : Promise.resolve();
      bootPromise
        .catch((err) => {
          setDbUnavailableReason(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
          setDbUnavailable(true);
        })
        .finally(() => {
          getBackendStatus()
            .then((st) => {
              if (!st.database) {
                setDbUnavailableReason(st.message || 'Backend ตอบแต่ฐานข้อมูลเชื่อมไม่ได้');
                setDbUnavailable(true);
              }
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์';
              setDbUnavailableReason(msg);
              setDbUnavailable(true);
              console.error('[App] getBackendStatus failed:', err);
            })
            .finally(() => setApiLoading(false));
        });
    } else {
      setApiLoading(false);
      fetchData({ forceReplaceRequests: true });
    }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (isApiMode()) {
          const u = getInitialUser();
          if (u) Promise.all([loadAttendanceForUser(u.id), loadNotificationsForUser(u.id)]).then(() => fetchData({ forceReplaceRequests: true }));
          else fetchData({ forceReplaceRequests: true });
        } else {
          fetchData({ forceReplaceRequests: true });
        }
        if (!intervalId) intervalId = setInterval(() => fetchData(), 10000);
      } else {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      }
    };
    if (document.visibilityState === 'visible') intervalId = setInterval(() => fetchData(), 10000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchData]);

  useEffect(() => {
    document.title = APP_TITLE_WITH_VERSION;
  }, []);

  useEffect(() => {
    if (!isApiMode()) return;
    const onSessionReplaced = (e: Event) => {
      const d = (e as CustomEvent<{ loggedInFromIp?: string; loggedInAt?: string; userAgent?: string }>)?.detail ?? {};
      const ip = d.loggedInFromIp?.trim() || 'ไม่ทราบ';
      const at = d.loggedInAt ? new Date(d.loggedInAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '';
      const ua = d.userAgent?.trim() || '';
      let msg = 'มีการใช้งานบนอุปกรณ์อื่นแล้ว\n\n';
      msg += `IP Address: ${ip}\n`;
      if (at) msg += `เมื่อ: ${at}\n`;
      if (ua) msg += `อุปกรณ์/เบราว์เซอร์: ${ua.length > 80 ? ua.slice(0, 80) + '…' : ua}\n`;
      msg += '\nออกจากระบบบนอุปกรณ์นี้แล้ว';
      logoutUser();
      setCurrentUser(null);
      showAlert(msg);
    };
    window.addEventListener(SESSION_REPLACED_EVENT, onSessionReplaced);
    return () => window.removeEventListener(SESSION_REPLACED_EVENT, onSessionReplaced);
  }, [showAlert]);

  /** เช็ก session เมื่อผู้ใช้ขยับเมาส์/กดคีย์/โฟกัส (throttle 2 วินาที) — ถ้า login จาก device อื่นจะแจ้งเตือนและ logout ทันที */
  useEffect(() => {
    if (!isApiMode() || !currentUser) return;
    let lastCheck = 0;
    const throttleMs = 2000;
    const runCheck = () => {
      const now = Date.now();
      if (now - lastCheck < throttleMs) return;
      lastCheck = now;
      getSessionCheck();
    };
    const events = ['mousemove', 'keydown', 'focus'] as const;
    events.forEach(ev => window.addEventListener(ev, runCheck));
    return () => events.forEach(ev => window.removeEventListener(ev, runCheck));
  }, [currentUser?.id]);

  useEffect(() => {
    if (activeTab === 'report') {
      setReportTick(t => t + 1); // force recompute ทุกครั้งที่เปิดหน้า Report
    }
    if (activeTab === 'report' && currentUser?.role === UserRole.MANAGER && isApiMode()) {
      loadLeaveRequestsForManager(currentUser.id).then(() => {
        fetchData({ forceReplaceRequests: true });
        setReportTick(t => t + 1); // force recompute อีกครั้งหลัง data โหลดเสร็จ
      });
    }
  }, [activeTab, currentUser?.id, currentUser?.role, fetchData]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (isApiMode()) {
      Promise.all([loadAttendanceForUser(user.id), loadNotificationsForUser(user.id)]).then(() => fetchData({ forceReplaceRequests: true }));
    } else {
      fetchData({ forceReplaceRequests: true });
    }
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    showConfirm('ยืนยันการออกจากระบบหรือไม่?', () => {
      logoutUser();
      setCurrentUser(null);
    });
  };

  /** คำขอลาของ currentUser เอง — ใช้ cache โดยตรงเพราะ requests state ของ Manager มีแค่ข้อมูลลูกน้อง */
  const myRequests = useMemo(() => {
    if (!currentUser) return [];
    return getLeaveRequests().filter((r) => normalizeId(r.userId) === normalizeId(currentUser.id));
  }, [currentUser, requests, reportTick]);

  /** ชื่อผู้บังคับบัญชาของ currentUser */
  const managerName = useMemo(() => {
    if (!currentUser?.managerId) return null;
    return getAllUsers().find((u) => normalizeId(u.id) === normalizeId(currentUser.managerId))?.name ?? null;
  }, [currentUser, requests]);
  const currentUserLive = useMemo(() => {
    if (!currentUser) return null;
    return getAllUsers().find((u) => normalizeId(u.id) === normalizeId(currentUser.id)) ?? currentUser;
  }, [currentUser, requests, reportTick]);

  const leaveUsage = useMemo(() => {
    const approved: Record<string, number> = {};
    const pending: Record<string, number> = {};
    const currentYear = new Date().getFullYear();
    const parseDateAtNoon = (raw: string): Date => {
      const s = String(raw || '').trim();
      if (!s) return new Date('invalid');
      return new Date(s.includes('T') ? s : `${s}T12:00:00`);
    };
    myRequests
      .filter((r) => {
        const status = String(r.status || '').toUpperCase();
        if (status !== LeaveStatus.APPROVED && status !== LeaveStatus.PENDING) return false;
        const start = parseDateAtNoon(r.startDate);
        return !isNaN(start.getTime()) && start.getFullYear() === currentYear;
      })
      .forEach((r) => {
        const leaveTypeId = String(r.type || '').toUpperCase();
        const days = calculateBusinessDays(r.startDate, r.endDate);
        if (String(r.status || '').toUpperCase() === LeaveStatus.APPROVED) {
          approved[leaveTypeId] = (approved[leaveTypeId] ?? 0) + days;
        } else {
          pending[leaveTypeId] = (pending[leaveTypeId] ?? 0) + days;
        }
      });
    // รวม approved + pending เป็นยอดที่ใช้ (PENDING ถือว่า "จอง" วันลาไว้แล้ว)
    const combined: Record<string, number> = { ...approved };
    for (const [k, v] of Object.entries(pending)) {
      combined[k] = (combined[k] ?? 0) + v;
    }
    return { combined, approved, pending };
  }, [myRequests]);

  const vacationFullYearEntitlement = useMemo(() => {
    const normalizeJoinDateForCalc = (joinDateRaw?: string): string | null => {
      const raw = String(joinDateRaw || '').trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoPrefix) return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;
      const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slash) {
        const dd = Number(slash[1]);
        const mm = Number(slash[2]);
        let yy = Number(slash[3]);
        if (yy >= 2400) yy -= 543;
        if (yy < 1900 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return null;
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    };

    const normalizedJoinDate = normalizeJoinDateForCalc(currentUserLive?.joinDate);
    if (!normalizedJoinDate) return 0;
    const [joinYearStr, joinMonthStr, joinDayStr] = normalizedJoinDate.split('-');
    const joinYear = Number(joinYearStr);
    const joinMonth = Number(joinMonthStr);
    const joinDay = Number(joinDayStr);
    if (!joinYear || !joinMonth || !joinDay) return 0;

    const processYear = new Date().getFullYear();
    const anniversaryTime = Date.UTC(joinYear + 1, joinMonth - 1, joinDay, 0, 0, 0);
    const jan1Time = Date.UTC(processYear, 0, 1, 0, 0, 0);
    const yearEndTime = Date.UTC(processYear, 11, 31, 0, 0, 0);

    if (anniversaryTime > yearEndTime) return 0;
    if (anniversaryTime < jan1Time) return 12;

    const base = 12 - joinMonth + 1;
    const adjustment = joinDay <= 15 ? 0 : joinDay <= 25 ? 0.5 : 1;
    return Math.max(0, Math.min(12, Number((base - adjustment).toFixed(2))));
  }, [currentUserLive?.joinDate]);

  const displayRequests = useMemo(() => {
    if (!currentUser) return [];
    const allUsers = getAllUsers();
    if (currentUser.role === UserRole.ADMIN) return requests;
    if (currentUser.role === UserRole.MANAGER) {
      const subordinateSet = getSubordinateIdSetRecursive(currentUser.id, allUsers);
      if (subordinateSet.size > 0) {
        const normalizedSubordinateSet = new Set(Array.from(subordinateSet).map((id) => normalizeId(id)));
        return requests.filter((r) => normalizedSubordinateSet.has(normalizeId(r.userId)));
      }
      // Fallback: hierarchy ไม่พบ — ใช้ direct managerId match
      const directSubIds = new Set(
        allUsers
          .filter((u) => normalizeId(u.managerId) === normalizeId(currentUser.id))
          .map((u) => normalizeId(u.id))
      );
      return requests.filter((r) => directSubIds.has(normalizeId(r.userId)));
    }
    return requests.filter((r) => normalizeId(r.userId) === normalizeId(currentUser.id));
  }, [requests, currentUser]);

  /** สำหรับหน้า Report/Calendar: แสดงเฉพาะข้อมูลของผู้ใต้บังคับบัญชา — ไม่รวมข้อมูลของ Manager เอง
   *  Fallback: ถ้าหาลูกทีมจาก hierarchy ไม่เจอ (managerId ในDB อาจยังไม่ถูกตั้ง) ให้แสดงคำขอลาทั้งหมดใน cache
   *  reportTick เป็น dependency เพื่อ force recompute จาก cache ล่าสุด หลัง loadFromApi/loadLeaveRequestsForManager เสร็จ */
  const reportRequests = useMemo(() => {
    if (!currentUser) return [];
    const allUsers = getAllUsers();
    const allReqs = getLeaveRequests();
    if (currentUser.role === UserRole.ADMIN) return allReqs;
    if (currentUser.role === UserRole.MANAGER) {
      // รายงานในสังกัด: ยึด managerId จากข้อมูล users ในระบบเท่านั้น
      const directSubIds = new Set(
        allUsers
          .filter((u) => normalizeId(u.managerId) === normalizeId(currentUser.id))
          .map((u) => normalizeId(u.id))
      );
      return allReqs.filter((r) => directSubIds.has(normalizeId(r.userId)));
    }
    return displayRequests;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, requests, displayRequests, reportTick]);

  /** รายการที่ current user อนุมัติได้เท่านั้น — ADMIN เห็นทุกคำขอ PENDING, MANAGER เห็นเฉพาะลูกทีมที่รายงานตรงถึงตัวเอง */
  const approvalBoardRequests = useMemo(() => {
    if (!currentUser || (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.MANAGER)) return [];
    const allRequests = getLeaveRequests();
    if (currentUser.role === UserRole.ADMIN) {
      return allRequests.filter(r => r.status === LeaveStatus.PENDING);
    }
    const allUsers = getAllUsers();
    const managerIdNorm = normalizeUserId(currentUser.id);
    return allRequests.filter(r => {
      const employee = allUsers.find(u => normalizeUserId(u.id) === normalizeUserId(r.userId));
      return employee != null && normalizeUserId(employee.managerId) === managerIdNorm;
    });
  }, [requests, currentUser, reportTick]);

  const dashboardLeaveTypes = useMemo(() => currentUser ? getLeaveTypesForGender(currentUser.gender) : [], [currentUser]);
  const leaveTypeLabelMap = useMemo(() => Object.fromEntries(getLeaveTypes().map(t => [t.id, t.label])), []);
  const recentDashboardItems = useMemo(() => {
    const leaveItems = myRequests.map((r) => ({
      id: `leave-${r.id}`,
      kind: 'leave' as const,
      title: leaveTypeLabelMap[r.type] ?? r.type,
      dateText: `${formatYmdAsDdMmBe(r.startDate)} ถึง ${formatYmdAsDdMmBe(r.endDate)} • ${calculateBusinessDays(r.startDate, r.endDate)} วันทำการ`,
      detailText: `เหตุผลการลา: ${String(r.reason || '-').trim() || '-'}`,
      occurredAt: String(r.submittedAt || r.startDate || ''),
      status: STATUS_LABELS[r.status],
      statusClass: STATUS_COLORS[r.status],
      paidDate: '',
      extraText: '',
    }));
    const expenseItems = myExpenseClaims.map((c) => {
      const statusLabel = c.status === 'PAID'
        ? 'อนุมัติแล้ว'
        : c.status === 'APPROVED'
          ? 'อนุมัติแล้ว'
          : c.status === 'WAITING'
            ? 'รออนุมัติ'
            : c.status === 'REJECTED'
              ? 'ไม่อนุมัติ'
              : 'บันทึก';
      const statusClass = c.status === 'PAID' || c.status === 'APPROVED'
        ? 'bg-emerald-100 text-emerald-700'
        : c.status === 'WAITING'
          ? 'bg-amber-100 text-amber-700'
          : c.status === 'REJECTED'
            ? 'bg-rose-100 text-rose-700'
            : 'bg-gray-100 text-gray-700';
      return {
        id: `exp-${c.id}`,
        kind: 'expense' as const,
        title: `ใบเบิก ${Number(c.totalAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
        dateText: `วันที่รายการ ${formatYmdAsDdMmBe(c.claimDate)}`,
        detailText: `โครงการ: ${String(c.projectSummary || '-').trim() || '-'} • ${Array.from(new Set((c.items || []).map((it) => expenseTypeLabelMap[it.expenseTypeId] || it.expenseTypeId).filter(Boolean))).join(', ') || '-'}`,
        occurredAt: String(c.submittedAt || c.claimDate || ''),
        status: statusLabel,
        statusClass,
        paidDate: c.paidDate ? formatYmdAsDdMmBe(c.paidDate) : '',
        extraText: `รายละเอียด: ${String(c.detailSummary || c.adminNote || '-').trim() || '-'}`,
      };
    });
    return [...leaveItems, ...expenseItems]
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
      .slice(0, 5);
  }, [calculateBusinessDays, expenseTypeLabelMap, leaveTypeLabelMap, myExpenseClaims, myRequests]);
  const visibleDashboardLeaveTypes = useMemo(() => {
    const all = dashboardLeaveTypes.filter(lt => lt.id !== 'OTHER');
    return showAllDashboardLeaveTypes ? all : all.filter(lt => DEFAULT_DASHBOARD_LEAVE_IDS.includes(lt.id));
  }, [dashboardLeaveTypes, showAllDashboardLeaveTypes]);
  const hasMoreLeaveTypes = useMemo(
    () => dashboardLeaveTypes.some(lt => lt.id !== 'OTHER' && !DEFAULT_DASHBOARD_LEAVE_IDS.includes(lt.id)),
    [dashboardLeaveTypes]
  );

  const tenureYears = useMemo(() => {
    if (!currentUser) return 0;
    const join = new Date(currentUser.joinDate);
    return (Date.now() - join.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  }, [currentUser]);

  if (apiLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="text-blue-600 font-bold">กำลังโหลดข้อมูลจากเซิร์ฟเวอร์...</div>
        <footer className="mt-auto py-3 px-4 border-t border-gray-100 text-center text-[10px] text-gray-500 font-medium w-full">
          ลิขสิทธิ์ของระบบ เป็นของ CONNEX Business Online Co., Ltd.
        </footer>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        {dbUnavailable && (
          <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-center text-sm text-red-800 font-medium">
            <p>ติดต่อฐานข้อมูลไม่ได้ กรุณาลองอีกครั้งใน 15 นาที</p>
            {dbUnavailableReason && (
              <p className="text-xs text-red-600 mt-1 font-normal">สาเหตุ: {dbUnavailableReason}</p>
            )}
            <p className="text-xs text-red-600 mt-1">
              ตรวจสอบ: ถ้ารันบนเครื่อง — ในโฟลเดอร์ <code className="bg-red-100 px-1 rounded">server</code> ใช้ <code className="bg-red-100 px-1 rounded">npm run dev</code> แล้วรีเฟรช. ถ้า deploy บน Vercel — ตั้ง <strong>VITE_API_URL</strong> = URL ของ Backend แล้ว <strong>Redeploy Frontend</strong>; Backend ต้องมี <strong>DATABASE_URL</strong> (Supabase) และ <strong>JWT_SECRET</strong>
            </p>
            {getApiBase() && (
              <p className="text-[10px] text-red-500 mt-0.5">แอปกำลังเรียก: {getApiBase()}/api/status</p>
            )}
          </div>
        )}
        {isApiMode() && !dbUnavailable ? (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-center text-xs text-blue-700 font-medium">
            โหมด Supabase — ข้อมูลโหลดและบันทึกลงเซิร์ฟเวอร์
          </div>
        ) : !dbUnavailable ? (
          <>
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-center text-xs text-amber-800 font-medium">
              โหมดเก็บในเครื่อง — ข้อมูลจะไม่ส่งไปยัง Supabase
            </div>
            <div className="px-4 py-1.5 bg-amber-100/80 border-b border-amber-200 text-center text-[10px] text-amber-700">
              เช็ก: Vercel → โปรเจกต์ <strong>Frontend</strong> → Settings → Environment Variables → มี <strong>VITE_API_URL</strong> หรือไม่? หลังเพิ่ม/แก้ต้อง <strong>Redeploy</strong>
            </div>
          </>
        ) : null}
        <Login onLogin={handleLogin} />
        <footer className="mt-auto py-3 px-4 border-t border-gray-100 text-center text-[10px] text-gray-500 font-medium">
          ลิขสิทธิ์ของระบบ เป็นของ CONNEX Business Online Co., Ltd.
        </footer>
      </div>
    );
  }

  const isManagerOrAdmin = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.ADMIN;

  const NavIcon: React.FC<{ variant: 'home' | 'clock' | 'history' | 'receipt' | 'chart' | 'settings'; active: boolean }> = ({ variant, active }) => {
    const base = 'w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 transition';
    const palette: Record<typeof variant, { bg: string; fg: string; bgActive: string; fgActive: string }> = {
      home: { bg: 'bg-sky-50', fg: 'text-sky-600', bgActive: 'bg-sky-100', fgActive: 'text-sky-700' },
      clock: { bg: 'bg-emerald-50', fg: 'text-emerald-600', bgActive: 'bg-emerald-100', fgActive: 'text-emerald-700' },
      history: { bg: 'bg-amber-50', fg: 'text-amber-600', bgActive: 'bg-amber-100', fgActive: 'text-amber-700' },
      receipt: { bg: 'bg-cyan-50', fg: 'text-cyan-600', bgActive: 'bg-cyan-100', fgActive: 'text-cyan-700' },
      chart: { bg: 'bg-violet-50', fg: 'text-violet-600', bgActive: 'bg-violet-100', fgActive: 'text-violet-700' },
      settings: { bg: 'bg-rose-50', fg: 'text-rose-600', bgActive: 'bg-rose-100', fgActive: 'text-rose-700' },
    };
    const p = palette[variant];
    const cls = `${base} ${active ? p.bgActive : p.bg} ${active ? p.fgActive : p.fg}`;
    const iconCls = 'w-5 h-5';
    const iconMap: Record<typeof variant, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
      home: Home,
      clock: Clock3,
      history: History,
      receipt: ReceiptText,
      chart: BarChart3,
      settings: Settings2,
    };
    const Icon = iconMap[variant];
    return (
      <div className={cls} aria-hidden="true">
        <Icon className={iconCls} strokeWidth={2.2} />
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="p-6 h-full flex flex-col">
          <div className="flex flex-col gap-2 mb-8">
            <img src="/connex-logo.png" alt="CONNEX" className="h-9 w-auto object-contain self-start" />
            <h1 className="font-bold text-gray-900 tracking-tight text-sm">{APP_TITLE_WITH_VERSION}</h1>
            <span className="text-[10px] text-gray-500">อัปเดตโค้ดล่าสุด: {APP_LAST_UPDATED}</span>
          </div>

          <nav className="space-y-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <NavIcon variant="home" active={activeTab === 'dashboard'} />
              หน้าแรก
            </button>
            <button 
              onClick={() => setActiveTab('attendance')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'attendance' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <NavIcon variant="clock" active={activeTab === 'attendance'} />
              ลงเวลาทำงาน
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'history' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <NavIcon variant="history" active={activeTab === 'history'} />
              ประวัติรายการ
            </button>
            <button
              onClick={() => setActiveTab('expense')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'expense' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <NavIcon variant="receipt" active={activeTab === 'expense'} />
              เบิกค่าใช้จ่าย
            </button>
            {isManagerOrAdmin && (
              <button 
                onClick={() => setActiveTab('report')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'report' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <NavIcon variant="chart" active={activeTab === 'report'} />
                รายงานสรุป
              </button>
            )}
            {isManagerOrAdmin && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <NavIcon variant="settings" active={activeTab === 'admin'} />
                ตั้งค่าระบบ
              </button>
            )}
          </nav>

          {!isApiMode() && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide mb-1">โหมดเก็บในเครื่อง</p>
              <p className="text-xs text-amber-700">คำขอลาและข้อมูลจะไม่ส่งไปยัง Supabase</p>
              <p className="text-[10px] text-amber-600 mt-1">ตั้งค่า: Vercel → โปรเจกต์ <strong>Frontend</strong> (connex-leave-flow) → Settings → Environment Variables → เพิ่ม <strong>VITE_API_URL</strong> = URL ของ Backend → แล้วกด <strong>Redeploy</strong></p>
            </div>
          )}

          <div className="mt-auto pt-10">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-2 tracking-widest">User Session</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-gray-900 truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wide">
                    {currentUser.role === UserRole.ADMIN ? 'ผู้ดูแลระบบ' : currentUser.role === UserRole.MANAGER ? 'ผู้จัดการ' : 'พนักงาน'}
                  </p>
                  {managerName && (
                    <p className="text-[10px] text-gray-400 font-bold truncate mt-0.5">
                      ผู้บังคับบัญชา: {managerName}
                    </p>
                  )}
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full mt-3 text-[10px] font-bold text-red-500 hover:text-red-700 text-left px-1"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-black text-gray-900">
              {activeTab === 'dashboard' && 'แดชบอร์ด'}
              {activeTab === 'attendance' && 'ลงเวลาทำงาน'}
              {activeTab === 'history' && 'ประวัติรายการ'}
              {activeTab === 'expense' && 'เบิกค่าใช้จ่ายทั่วไป'}
              {activeTab === 'report' && (reportSubTab === 'leave' ? 'รายงานการลา' : reportSubTab === 'team' ? 'รายงานการเข้างานของทีม' : 'รายงานสรุปข้อมูลโครงการฯ')}
              {activeTab === 'admin' && 'จัดการระบบ'}
            </h2>
            <p className="text-sm text-gray-500 font-medium">ยินดีต้อนรับกลับมา, {currentUser.name}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-gray-400 uppercase">วันนี้</p>
            <p className="text-sm font-black text-gray-800">{formatYmdAsDdMmBe(todayLocalYmd())}</p>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2 space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {visibleDashboardLeaveTypes.map(lt => {
                  const baseQuota = lt.id === 'VACATION'
                    ? vacationFullYearEntitlement
                    : (currentUserLive?.quotas?.[lt.id] ?? lt.defaultQuota);
                  const quota = baseQuota;
                  const usedApproved = leaveUsage.approved[lt.id] || 0;
                  const usedPending = leaveUsage.pending[lt.id] || 0;
                  const used = leaveUsage.combined[lt.id] || 0;
                  const remaining = quota - used;
                  const usedLabel = usedPending > 0
                    ? `อนุมัติแล้ว ${usedApproved.toFixed(2)} + รออนุมัติ ${usedPending.toFixed(2)} วัน (ปีนี้)`
                    : `ใช้ไปแล้ว ${usedApproved.toFixed(2)} วันทำการ (ปีนี้ · ตัดยอด 31 ธ.ค.)`;
                  const pct = quota > 0 && quota < 999 ? Math.min(100, (used / quota) * 100) : (quota === 0 && used > 0 ? 100 : 0);
                  return (
                    <div key={lt.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{lt.label}</p>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-black ${remaining < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {quota >= 999 ? '∞' : remaining < 0 ? `-${(-remaining).toFixed(2)}` : remaining.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-gray-500 font-bold">{remaining < 0 ? 'วัน (ติดลบ)' : 'วันคงเหลือ'}</span>
                      </div>
                      <div className="mt-3 w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                        <div className={`h-full ${remaining < 0 || (remaining < 2 && quota > 0) ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-2 text-[10px] text-gray-400 font-bold">{usedLabel}</p>
                    </div>
                  );
                })}
              </div>
              {hasMoreLeaveTypes && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowAllDashboardLeaveTypes(prev => !prev)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {showAllDashboardLeaveTypes ? 'ซ่อนประเภทอื่น' : 'ดูทุกประเภทวันลา'}
                  </button>
                </div>
              )}

              {isManagerOrAdmin && (
                <PendingApprovalsBoard leaveRequests={approvalBoardRequests} currentUser={currentUser} onUpdate={fetchData} />
              )}

              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-gray-900">รายการลาล่าสุด</h3>
                  <button onClick={() => setActiveTab('history')} className="text-xs font-bold text-blue-600 hover:underline">ดูทั้งหมด</button>
                </div>
                <div className="space-y-4">
                  {recentDashboardItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${item.kind === 'leave' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                          {item.kind === 'leave' ? 'ลา' : 'เบิก'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{item.title}</p>
                          <p className="text-[10px] text-gray-500 font-bold">{item.dateText}</p>
                          <p className="text-[10px] text-gray-700 font-bold">{item.detailText}</p>
                          {item.kind === 'expense' && (
                            <p className="text-[10px] text-gray-700 font-bold">
                              {item.extraText || 'รายละเอียด: -'}
                            </p>
                          )}
                          {item.kind === 'expense' && (
                            <p className="text-[10px] text-violet-700 font-bold">
                              วันทำจ่าย: {item.paidDate || '-'}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${item.statusClass}`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                  {recentDashboardItems.length === 0 && (
                     <p className="text-center py-4 text-gray-400 italic text-sm">ยังไม่มีรายการ</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <LeaveForm user={currentUser} onSuccess={fetchData} />
              <NotificationCenter notifications={notifications} userId={currentUser.id} onUpdate={fetchData} />
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 p-1 bg-gray-100 rounded-xl w-fit">
              <button
                onClick={() => setAttendanceSubTab('attendance')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${attendanceSubTab === 'attendance' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ลงเวลาเข้างาน/ออกงาน
              </button>
              <button
                onClick={() => setAttendanceSubTab('timesheet')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${attendanceSubTab === 'timesheet' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Timesheet
              </button>
            </div>
            {attendanceSubTab === 'attendance'
              ? <AttendanceModule user={currentUser} onUpdate={fetchData} />
              : <TimesheetModule currentUser={currentUser} onUpdate={fetchData} />}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 p-1 bg-gray-100 rounded-xl w-fit">
              <button 
                onClick={() => setHistorySubTab('leave')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${historySubTab === 'leave' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ประวัติการลา
              </button>
              <button 
                onClick={() => setHistorySubTab('attendance')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${historySubTab === 'attendance' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ประวัติการลงเวลา
              </button>
              <button 
                onClick={() => setHistorySubTab('vacation')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${historySubTab === 'vacation' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                รายละเอียดการหักวันลา
              </button>
            </div>

            {historySubTab === 'leave' && (
              <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">ประเภท / วันที่</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">เหตุผล</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">สถานะ</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">ส่งเมื่อ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {myRequests.map(req => (
                        <tr key={req.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-gray-900">{leaveTypeLabelMap[req.type] ?? req.type}</p>
                            <p className="text-[10px] text-gray-500 font-bold">
                              {formatYmdAsDdMmBe(req.startDate)} ถึง {formatYmdAsDdMmBe(req.endDate)}
                              {' '}• {calculateBusinessDays(req.startDate, req.endDate)} วันทำการ
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs text-gray-700 font-medium truncate max-w-xs">{req.reason}</p>
                            {req.managerComment && (
                              <div className="mt-1 flex items-start gap-1">
                                <span className="text-[9px] font-black text-blue-600 uppercase">Manager Note:</span>
                                <span className="text-[9px] text-gray-500 italic">"{req.managerComment}"</span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${STATUS_COLORS[req.status]}`}>
                              {STATUS_LABELS[req.status]}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-[10px] font-bold text-gray-400">
                            {formatBangkokDateAsDdMmBe(req.submittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {myRequests.length === 0 && <div className="text-center py-20 text-gray-400 font-bold italic text-sm">ไม่พบรายการประวัติการลา</div>}
                </div>
              </div>
            )}

            {historySubTab === 'attendance' && (
              <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">วันที่</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">เวลาเข้า (IN)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">เวลาออก (OUT)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">ชั่วโมงทำงาน</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {attendanceHistory.map(rec => (
                        <tr key={rec.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-gray-900">
                              {formatYmdAsDdMmBe(rec.date)}
                            </p>
                          </td>
                          <td className={`px-6 py-4 text-center font-black text-sm ${rec.isLate ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {formatTimeAsHm(rec.checkIn)}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-gray-900 text-sm">
                            {formatTimeAsHm(rec.checkOut)}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-gray-800 text-sm">
                            {calculateWorkedHours(rec)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {rec.isLate ? (
                              <div className="flex flex-col items-end">
                                <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase">มาสาย</span>
                                <span className="text-[9px] text-rose-400 font-bold mt-1 tracking-tighter">หักพักร้อน {calculateLatePenaltyDays(rec.checkIn)} วัน</span>
                              </div>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase">ปกติ</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {attendanceHistory.length === 0 && <div className="text-center py-20 text-gray-400 font-bold italic text-sm">ไม่พบประวัติการลงเวลา</div>}
                </div>
              </div>
            )}

            {historySubTab === 'vacation' && (
              <VacationLedger user={currentUser} />
            )}

          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 p-1 bg-gray-100 rounded-xl w-fit">
              <button
                onClick={() => setReportSubTab('leave')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${reportSubTab === 'leave' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                รายงานการลา
              </button>
              <button
                onClick={() => setReportSubTab('team')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${reportSubTab === 'team' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                รายงานการเข้างานของทีม
              </button>
              <button
                onClick={() => setReportSubTab('project')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition ${reportSubTab === 'project' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                รายงานสรุปข้อมูลโครงการฯ
              </button>
            </div>
            {reportSubTab === 'leave' && <ReportSummary requests={reportRequests} currentUser={currentUser} />}
            {reportSubTab === 'team' && <TeamAttendance manager={currentUser} />}
            {reportSubTab === 'project' && <ProjectTimesheetReport currentUser={currentUser} />}
          </div>
        )}
        {activeTab === 'expense' && <ExpenseModule currentUser={currentUser} />}
        {activeTab === 'admin' && <AdminPanel currentUser={currentUser} onUserDeleted={(id) => { if (currentUser?.id === id) handleLogout(); }} />}
      </main>
      </div>
      <footer className="py-3 px-4 bg-white border-t border-gray-100 text-center text-[10px] text-gray-500 font-medium">
        ลิขสิทธิ์ของระบบ เป็นของ CONNEX Business Online Co., Ltd.
      </footer>
    </div>
  );
};

export default App;
