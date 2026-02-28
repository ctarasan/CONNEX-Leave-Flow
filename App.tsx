
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, UserRole, LeaveRequest, Notification, LeaveStatus, AttendanceRecord } from './types';
import { getInitialUser, getLeaveRequests, getNotifications, getAllUsers, getAttendanceRecords, getLeaveTypesForGender, getLeaveTypes, getHolidays, logoutUser, getSubordinateIdSetRecursive, loadFromApi, loadAttendanceForUser, loadNotificationsForUser, loadLeaveRequestsForManager, normalizeUserId } from './store';
import { isApiMode, getBackendStatus } from './api';
import LeaveForm from './components/LeaveForm';
import ApprovalBoard from './components/ApprovalBoard';
import NotificationCenter from './components/NotificationCenter';
import ReportSummary from './components/ReportSummary';
import AdminPanel from './components/AdminPanel';
import AttendanceModule from './components/AttendanceModule';
import TeamAttendance from './components/TeamAttendance';
import VacationLedger from './components/VacationLedger';
import Login from './components/Login';
import { STATUS_LABELS, STATUS_COLORS, HOLIDAYS_2026, APP_TITLE_WITH_VERSION, APP_LAST_UPDATED } from './constants';
import { formatThaiDate } from './utils';
import { useAlert } from './AlertContext';

/** ประเภทวันลาที่แสดงบนแดชบอร์ดโดย default: ลาป่วย ลาพักร้อน ลากิจ */
const DEFAULT_DASHBOARD_LEAVE_IDS = ['SICK', 'VACATION', 'PERSONAL'];

const App: React.FC = () => {
  const { showConfirm } = useAlert();
  const [currentUser, setCurrentUser] = useState<User | null>(getInitialUser());
  const [apiLoading, setApiLoading] = useState(isApiMode());
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attendance' | 'history' | 'report' | 'admin'>('dashboard');
  const [historySubTab, setHistorySubTab] = useState<'leave' | 'attendance' | 'vacation' | 'team'>('leave');
  /** แดชบอร์ด: แสดงเฉพาะ ลาป่วย ลาพักร้อน ลากิจ โดย default; ใช้ลิงก์ "ดูทุกประเภทวันลา" เพื่อแสดงที่เหลือ */
  const [showAllDashboardLeaveTypes, setShowAllDashboardLeaveTypes] = useState(false);
  /** ตัวนับเพื่อ force reportRequests ให้ recompute จาก cache หลัง loadLeaveRequestsForManager หรือ loadFromApi เสร็จ */
  const [reportTick, setReportTick] = useState(0);
  /** โหมด API: เป็น true เมื่อติดต่อ Backend/ฐานข้อมูลไม่ได้ — แสดงข้อความบนหน้า Login */
  const [dbUnavailable, setDbUnavailable] = useState(false);

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
        let managedRequests = allRequests.filter(request => subordinateSet.has(request.userId));
        // Fallback: ถ้า hierarchy ใน DB ยังไม่ได้ตั้งค่า ลอง direct managerId match
        if (managedRequests.length === 0 && allRequests.length > 0) {
          const directSubIds = new Set(allUsers.filter(u => u.managerId === updatedUser!.id).map(u => u.id));
          if (directSubIds.size > 0) {
            managedRequests = allRequests.filter(request => directSubIds.has(request.userId));
          }
        }
        setRequests(prev => {
          if (!options?.forceReplaceRequests && managedRequests.length === 0 && prev.length > 0) return prev;
          return managedRequests;
        });
      } else {
        const myRequests = allRequests.filter(r => r.userId === updatedUser!.id);
        setRequests(prev => {
          if (!options?.forceReplaceRequests && myRequests.length === 0 && prev.length > 0) return prev;
          return myRequests;
        });
      }

      setNotifications(allNotifs);
      setAttendanceHistory(allAttendance);
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
      loadFromApi()
        .then(() => {
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
        .catch(() => setDbUnavailable(true))
        .finally(() => {
          getBackendStatus()
            .then((st) => { if (!st.database) setDbUnavailable(true); })
            .catch(() => setDbUnavailable(true))
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
          else loadFromApi().then(() => fetchData({ forceReplaceRequests: true }));
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
    return getLeaveRequests().filter(r => r.userId === currentUser.id);
  }, [currentUser, requests, reportTick]);

  /** ชื่อผู้บังคับบัญชาของ currentUser */
  const managerName = useMemo(() => {
    if (!currentUser?.managerId) return null;
    return getAllUsers().find(u => u.id === currentUser.managerId)?.name ?? null;
  }, [currentUser, requests]);

  const leaveUsage = useMemo(() => {
    const approved: Record<string, number> = {};
    const pending: Record<string, number> = {};
    const currentYear = new Date().getFullYear();
    myRequests
      .filter(r =>
        (r.status === LeaveStatus.APPROVED || r.status === LeaveStatus.PENDING) &&
        new Date(r.startDate).getFullYear() === currentYear
      )
      .forEach(r => {
        const days = calculateBusinessDays(r.startDate, r.endDate);
        if (r.status === LeaveStatus.APPROVED) {
          approved[r.type] = (approved[r.type] ?? 0) + days;
        } else {
          pending[r.type] = (pending[r.type] ?? 0) + days;
        }
      });
    // รวม approved + pending เป็นยอดที่ใช้ (PENDING ถือว่า "จอง" วันลาไว้แล้ว)
    const combined: Record<string, number> = { ...approved };
    for (const [k, v] of Object.entries(pending)) {
      combined[k] = (combined[k] ?? 0) + v;
    }
    return { combined, approved, pending };
  }, [myRequests]);

  const displayRequests = useMemo(() => {
    if (!currentUser) return [];
    const allUsers = getAllUsers();
    if (currentUser.role === UserRole.ADMIN) return requests;
    if (currentUser.role === UserRole.MANAGER) {
      const subordinateSet = getSubordinateIdSetRecursive(currentUser.id, allUsers);
      if (subordinateSet.size > 0) return requests.filter(r => subordinateSet.has(r.userId));
      // Fallback: hierarchy ไม่พบ — ใช้ direct managerId match
      const directSubIds = new Set(allUsers.filter(u => u.managerId === currentUser.id).map(u => u.id));
      return requests.filter(r => directSubIds.has(r.userId));
    }
    return requests.filter(r => r.userId === currentUser.id);
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
      const subordinateSet = getSubordinateIdSetRecursive(currentUser.id, allUsers);
      if (subordinateSet.size > 0) {
        return allReqs.filter(r => subordinateSet.has(r.userId));
      }
      // Fallback: ลูกทีมหาจาก hierarchy ไม่เจอ — ลองตรวจสอบ direct manager-id match
      const directSubIds = new Set(allUsers.filter(u => u.managerId === currentUser.id).map(u => u.id));
      if (directSubIds.size > 0) {
        return allReqs.filter(r => directSubIds.has(r.userId));
      }
      // Fallback สุดท้าย: แสดงทุกรายการใน cache ยกเว้น Manager เอง (กรณี hierarchy ยังไม่ได้ตั้งค่าใน DB)
      return allReqs.filter(r => r.userId !== currentUser.id);
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
  const visibleDashboardLeaveTypes = useMemo(() => {
    const all = dashboardLeaveTypes.filter(lt => lt.id !== 'OTHER');
    return showAllDashboardLeaveTypes ? all : all.filter(lt => DEFAULT_DASHBOARD_LEAVE_IDS.includes(lt.id));
  }, [dashboardLeaveTypes, showAllDashboardLeaveTypes]);
  const hasMoreLeaveTypes = useMemo(
    () => dashboardLeaveTypes.some(lt => lt.id !== 'OTHER' && !DEFAULT_DASHBOARD_LEAVE_IDS.includes(lt.id)),
    [dashboardLeaveTypes]
  );
  const leaveTypeLabelMap = useMemo(() => Object.fromEntries(getLeaveTypes().map(t => [t.id, t.label])), []);

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
            ติดต่อฐานข้อมูลไม่ได้ กรุณาลองอีกครั้งใน 15 นาที
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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              หน้าแรก
            </button>
            <button 
              onClick={() => setActiveTab('attendance')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'attendance' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
              ลงเวลาทำงาน
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'history' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ประวัติรายการ
            </button>
            {isManagerOrAdmin && (
              <button 
                onClick={() => setActiveTab('report')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'report' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002 2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                รายงานสรุป
              </button>
            )}
            {currentUser.role === UserRole.ADMIN && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
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
              {activeTab === 'report' && 'รายงานการลา'}
              {activeTab === 'admin' && 'จัดการระบบ'}
            </h2>
            <p className="text-sm text-gray-500 font-medium">ยินดีต้อนรับกลับมา, {currentUser.name}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-gray-400 uppercase">วันนี้</p>
            <p className="text-sm font-black text-gray-800">{new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2 space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {visibleDashboardLeaveTypes.map(lt => {
                  const baseQuota = currentUser.quotas[lt.id] ?? lt.defaultQuota;
                  const isVacationUnderOneYear = lt.id === 'VACATION' && tenureYears < 1;
                  const quota = isVacationUnderOneYear ? 0 : baseQuota;
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
                <ApprovalBoard requests={approvalBoardRequests} currentUserId={currentUser.id} onUpdate={fetchData} />
              )}

              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-gray-900">รายการลาล่าสุด</h3>
                  <button onClick={() => setActiveTab('history')} className="text-xs font-bold text-blue-600 hover:underline">ดูทั้งหมด</button>
                </div>
                <div className="space-y-4">
                  {myRequests.slice(0, 5).map(req => (
                    <div key={req.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${STATUS_COLORS[req.status]}`}>
                          {(leaveTypeLabelMap[req.type] ?? req.type).charAt(2)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{leaveTypeLabelMap[req.type] ?? req.type}</p>
                          <p className="text-[10px] text-gray-500 font-bold">{formatThaiDate(req.startDate)} ถึง {formatThaiDate(req.endDate)}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${STATUS_COLORS[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </div>
                  ))}
                  {myRequests.length === 0 && (
                     <p className="text-center py-4 text-gray-400 italic text-sm">ยังไม่มีรายการลา</p>
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

        {activeTab === 'attendance' && <AttendanceModule user={currentUser} onUpdate={fetchData} />}

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
              {isManagerOrAdmin && (
                <button 
                  onClick={() => setHistorySubTab('team')}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition ${historySubTab === 'team' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  การเข้างานของทีม
                </button>
              )}
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
                            <p className="text-[10px] text-gray-500 font-bold">{formatThaiDate(req.startDate)} ถึง {formatThaiDate(req.endDate)}</p>
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
                            {new Date(req.submittedAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })}
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
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {attendanceHistory.map(rec => (
                        <tr key={rec.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-gray-900">
                              {new Date(rec.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </td>
                          <td className={`px-6 py-4 text-center font-black text-sm ${rec.isLate ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {rec.checkIn || '-'}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-gray-900 text-sm">
                            {rec.checkOut || '-'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {rec.isLate ? (
                              <div className="flex flex-col items-end">
                                <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase">มาสาย</span>
                                <span className="text-[9px] text-rose-400 font-bold mt-1 tracking-tighter">หักพักร้อน 0.25 วัน</span>
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

            {historySubTab === 'team' && isManagerOrAdmin && (
              <TeamAttendance manager={currentUser} />
            )}
          </div>
        )}

        {activeTab === 'report' && <ReportSummary requests={reportRequests} currentUser={currentUser} />}
        {activeTab === 'admin' && <AdminPanel onUserDeleted={(id) => { if (currentUser?.id === id) handleLogout(); }} />}
      </main>
      </div>
      <footer className="py-3 px-4 bg-white border-t border-gray-100 text-center text-[10px] text-gray-500 font-medium">
        ลิขสิทธิ์ของระบบ เป็นของ CONNEX Business Online Co., Ltd.
      </footer>
    </div>
  );
};

export default App;
