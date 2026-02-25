import React, { useEffect, useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { LeaveRequest, User, UserRole } from '../types';
import { HOLIDAYS_2026 } from '../constants';
import { getAllUsers, getLeaveTypes, getSubordinateIdSetRecursive, getLeaveRequests, getSubordinateIdsRecursive, loadLeaveRequestsForManager } from '../store';
import { isApiMode } from '../api';
import { formatThaiDate, formatThaiMonthYear, toBuddhistYear, THAI_MONTHS_FULL, currentCEYear } from '../utils';

interface ReportSummaryProps {
  requests: LeaveRequest[];
  currentUser: User | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

/** แปลง Date เป็น YYYY-MM-DD ตามเวลา local (แก้ปัญหา timezone เมื่อใช้ toISOString) */
const toLocalDateString = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const calculateBusinessDaysRange = (startStr: string, endStr: string) => {
  if (!startStr || !endStr) return 0;
  // ใช้ T12:00:00 เพื่อหลีกเลี่ยง timezone shift ที่อาจทำให้วันคลาดเคลื่อน
  const start = new Date(startStr.includes('T') ? startStr : startStr + 'T12:00:00');
  const end = new Date(endStr.includes('T') ? endStr : endStr + 'T12:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (start > end) return 0;

  let count = 0;
  const curDate = new Date(start.getTime());
  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    const y = curDate.getFullYear();
    const m = String(curDate.getMonth() + 1).padStart(2, '0');
    const d = String(curDate.getDate()).padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = !!HOLIDAYS_2026[isoDate];
    if (!isWeekend && !isHoliday) count++;
    curDate.setDate(curDate.getDate() + 1);
  }
  // ถ้า business days = 0 แต่มีช่วงวันที่ valid (เช่น ลาวันหยุด) → นับเป็น calendar days แทน
  if (count === 0) {
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
  return count;
};

const ReportSummary: React.FC<ReportSummaryProps> = ({ requests, currentUser }) => {
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [historyViewMode, setHistoryViewMode] = useState<'list' | 'calendar'>('list');
  const [reportScope, setReportScope] = useState<'month' | 'year'>('month');
  const [reportMonth, setReportMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportYear, setReportYear] = useState<number>(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [localRequests, setLocalRequests] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    setAllUsers(getAllUsers());
  }, [requests]); // refresh เมื่อ requests prop เปลี่ยน (หลังโหลด API สำเร็จ)

  // Self-load: ถ้า requests prop ว่างเปล่า (App ยังไม่โหลดเสร็จ) ให้ ReportSummary โหลดข้อมูลเอง
  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.MANAGER) return;
    if (requests.length > 0) {
      setLocalRequests([]);
      return;
    }
    if (isApiMode()) {
      loadLeaveRequestsForManager(currentUser.id).then(() => {
        const allUsers = getAllUsers();
        const subIds = new Set(getSubordinateIdsRecursive(currentUser.id, allUsers));
        const cached = getLeaveRequests();
        const filtered = subIds.size > 0
          ? cached.filter(r => subIds.has(r.userId))
          : cached.filter(r => r.userId !== currentUser.id);
        setLocalRequests(filtered);
        setAllUsers(allUsers);
      });
    } else {
      const allUsers = getAllUsers();
      const subIds = new Set(getSubordinateIdsRecursive(currentUser.id, allUsers));
      const cached = getLeaveRequests();
      const filtered = subIds.size > 0
        ? cached.filter(r => subIds.has(r.userId))
        : cached.filter(r => r.userId !== currentUser.id);
      setLocalRequests(filtered);
      setAllUsers(allUsers);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, requests.length]);

  const users = useMemo(() => {
    const list = allUsers;
    if (!currentUser) return list;
    if (currentUser.role === UserRole.ADMIN) return list;
    if (currentUser.role === UserRole.MANAGER) {
      const subordinateSet = getSubordinateIdSetRecursive(currentUser.id, list);
      if (subordinateSet.size > 0) return list.filter(u => subordinateSet.has(u.id));
      // Fallback: hierarchy ไม่พบใน DB — ใช้ direct managerId match แทน
      return list.filter(u => u.managerId === currentUser.id);
    }
    return list.filter(u => u.id === currentUser.id);
  }, [allUsers, currentUser]);

  useEffect(() => {
    if (selectedUser !== 'all' && !users.some(u => u.id === selectedUser)) setSelectedUser('all');
  }, [users, selectedUser]);

  // baseRequests: ใช้ requests prop ถ้ามีข้อมูล ถ้าไม่มีให้ fallback ไป localRequests ที่โหลดเองใน ReportSummary
  const baseRequests = requests.length > 0 ? requests : localRequests;

  const effectiveRequests = useMemo(() => {
    if (!currentUser || currentUser.role !== UserRole.MANAGER) return baseRequests;
    const subordinateIds = new Set(users.map(u => u.id));
    if (subordinateIds.size > 0) {
      return baseRequests.filter(r => subordinateIds.has(r.userId));
    }
    return baseRequests;
  }, [baseRequests, currentUser, users]);

  const filteredRequests = useMemo(() => {
    if (selectedUser === 'all') return effectiveRequests;
    return effectiveRequests.filter(r => r.userId === selectedUser);
  }, [effectiveRequests, selectedUser]);

  const [historyNameQuery, setHistoryNameQuery] = useState('');

  const leaveTypes = useMemo(() => getLeaveTypes().filter(t => t.isActive), [requests]);

  const stats = useMemo(() => {
    // นับตาม type ID ที่กำหนดไว้ใน leaveTypes
    const countByType: Record<string, { name: string; count: number }> = {};
    leaveTypes.forEach(lt => { countByType[lt.id] = { name: lt.label, count: 0 }; });
    // นับทุกรายการ — ถ้า type ไม่ตรงกับ leaveTypes ก็ใช้ type ID เป็น label (ป้องกัน chart ว่างเปล่า)
    filteredRequests.forEach(r => {
      if (countByType[r.type]) {
        countByType[r.type].count++;
      } else {
        countByType[r.type] = { name: r.type, count: (countByType[r.type]?.count ?? 0) + 1 };
      }
    });
    return Object.values(countByType).filter(s => s.count > 0);
  }, [filteredRequests, leaveTypes]);

  const calendarBaseRequests = useMemo(() => {
    const q = historyNameQuery.trim().toLowerCase();
    if (!q) return filteredRequests;
    return filteredRequests.filter((r) => r.userName.toLowerCase().includes(q));
  }, [filteredRequests, historyNameQuery]);

  const [calendarYear, calendarMonthIndex] = useMemo(() => {
    const [yearStr, monthStr] = calendarMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    return [year, month] as const;
  }, [calendarMonth]);

  const historyTableRequests = useMemo(() => {
    const nameQuery = historyNameQuery.trim().toLowerCase();

    const list = filteredRequests.filter((req) => {
      if (nameQuery && !req.userName.toLowerCase().includes(nameQuery)) return false;
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);

      if (reportScope === 'year') {
        return start.getFullYear() <= reportYear && end.getFullYear() >= reportYear;
      }
      const [yStr, mStr] = reportMonth.split('-');
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);
      if (!year || !month) return false;
      const firstOfMonth = new Date(year, month - 1, 1);
      const lastOfMonth = new Date(year, month, 0);
      return start <= lastOfMonth && end >= firstOfMonth;
    });
    return [...list].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [filteredRequests, historyNameQuery, reportScope, reportMonth, reportYear]);

  const formatDurationLabel = (days: number): string => {
    if (days === 0.5) return 'ครึ่งวัน';
    if (days === 1) return '1 วัน';
    if (days > 1 && days % 1 === 0.5) return `${Math.floor(days)} วันครึ่ง`;
    return `${days} วัน`;
  };

  const pivotData = useMemo(() => {
    if (!filteredRequests.length) return [];
    const map: Record<string, { userId: string; userName: string; byType: Record<string, number> }> = {};

    // ใช้ช่วงเวลาเดียวกับ historyTableRequests ตาม reportScope/reportYear/reportMonth
    const [pyStr, pmStr] = reportMonth.split('-');
    const pivotYear = parseInt(pyStr, 10);
    const pivotMonth = parseInt(pmStr, 10);

    filteredRequests.forEach((req) => {
      // ตาราง Pivot แสดงเฉพาะพนักงานใต้สายบังคับบัญชา — ไม่แสดง Manager เอง
      if (currentUser && req.userId === currentUser.id) return;
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      // กรองตาม reportScope (ปีหรือเดือน)
      if (reportScope === 'year') {
        if (start.getFullYear() > reportYear || end.getFullYear() < reportYear) return;
      } else {
        if (!pivotYear || !pivotMonth) return;
        const firstOfMonth = new Date(pivotYear, pivotMonth - 1, 1);
        const lastOfMonth = new Date(pivotYear, pivotMonth, 0);
        if (start > lastOfMonth || end < firstOfMonth) return;
      }
      if (!map[req.userId]) {
        const byType: Record<string, number> = {};
        leaveTypes.forEach((t) => { byType[t.id] = 0; });
        map[req.userId] = { userId: req.userId, userName: req.userName, byType };
      }
      const days = calculateBusinessDaysRange(req.startDate, req.endDate);
      map[req.userId].byType[req.type] = (map[req.userId].byType[req.type] ?? 0) + days;
    });

    const rows = Object.values(map);
    const totalDays = (row: { byType: Record<string, number> }) =>
      leaveTypes.reduce((sum, lt) => sum + (row.byType[lt.id] ?? 0), 0);
    return rows.sort((a, b) => totalDays(b) - totalDays(a));
  }, [filteredRequests, leaveTypes, currentUser, reportScope, reportYear, reportMonth]);

  const calendarData = useMemo(() => {
    const year = calendarYear;
    const month = calendarMonthIndex;
    if (!year || !month) {
      return { days: [], label: '' };
    }

    const firstOfMonth = new Date(year, month - 1, 1);
    const monthLabel = firstOfMonth.toLocaleDateString('th-TH', {
      month: 'long',
      year: 'numeric',
    });

    // Map วันที่ -> รายการลาที่ครอบคลุมวันนั้น (ใช้ local date เพื่อแก้ปัญหา timezone)
    const leaveByDate: Record<string, { userName: string; type: string }[]> = {};
    calendarBaseRequests.forEach((req) => {
      const start = new Date(req.startDate + 'T12:00:00'); // ใช้เที่ยงวันเพื่อหลีกเลี่ยง timezone shift
      const end = new Date(req.endDate + 'T12:00:00');
      const cur = new Date(start.getTime());
      while (cur <= end) {
        const iso = toLocalDateString(cur);
        if (!leaveByDate[iso]) leaveByDate[iso] = [];
        leaveByDate[iso].push({ userName: req.userName, type: req.type });
        cur.setDate(cur.getDate() + 1);
      }
    });

    const firstWeekday = firstOfMonth.getDay(); // 0-6 (อาทิตย์-เสาร์)
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstWeekday);

    const days: {
      iso: string;
      dayOfMonth: number;
      inMonth: boolean;
      leaves: { userName: string; type: string }[];
      isWeekend: boolean;
      holidayName?: string;
    }[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = toLocalDateString(d);
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const holidayName = HOLIDAYS_2026[iso];
      days.push({
        iso,
        dayOfMonth: d.getDate(),
        inMonth: d.getMonth() === firstOfMonth.getMonth(),
        leaves: leaveByDate[iso] || [],
        isWeekend,
        holidayName,
      });
    }

    return { days, label: monthLabel };
  }, [calendarBaseRequests, calendarMonth]);

  const changeMonth = (direction: 'prev' | 'next') => {
    setCalendarMonth((current) => {
      const [yearStr, monthStr] = current.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (!year || !month) return current;
      const base = new Date(year, month - 1, 1);
      base.setMonth(base.getMonth() + (direction === 'next' ? 1 : -1));
      const y = base.getFullYear();
      const m = String(base.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    });
  };

  // Auto-navigate: ถ้าเดือนปัจจุบันไม่มีข้อมูลวันลา แต่มีข้อมูลในเดือนอื่น → เลื่อนไปเดือนแรกที่มีข้อมูล
  useEffect(() => {
    if (calendarBaseRequests.length === 0) return;
    const [cy, cm] = calendarMonth.split('-').map(Number);
    const firstOfMonth = new Date(cy, cm - 1, 1);
    const lastOfMonth = new Date(cy, cm, 0);
    const hasThisMonth = calendarBaseRequests.some(req => {
      const s = new Date(req.startDate + 'T12:00:00');
      const e = new Date(req.endDate + 'T12:00:00');
      return s <= lastOfMonth && e >= firstOfMonth;
    });
    if (!hasThisMonth) {
      // หาเดือนแรกที่มีข้อมูล
      const months = calendarBaseRequests.map(req => req.startDate.substring(0, 7));
      const sorted = [...new Set(months)].sort();
      if (sorted.length > 0) setCalendarMonth(sorted[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarBaseRequests]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-2xl font-black text-gray-900">สรุปรายงานการลา</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">วิเคราะห์สถิติและพฤติกรรมการลาด้วย AI รายเดือน</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gray-50 p-3 rounded-3xl border border-gray-100 w-full md:w-auto">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">เลือกพนักงาน:</span>
            <select 
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-white border-2 border-gray-100 rounded-2xl px-4 py-2 text-sm font-bold text-gray-700 focus:border-blue-500 outline-none transition w-full sm:w-64"
            >
              <option value="all">พนักงานทุกคนในสังกัด</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredRequests.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12">
            <div className="h-[350px] w-full">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 text-center">การกระจายตัวประเภทการลา</p>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="count"
                  >
                    {stats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="h-[350px] w-full">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 text-center">สถิติการลาแยกตามประเภท (จำนวนครั้ง)</p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip 
                    cursor={{ fill: '#f9fafb' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                    {stats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-100 mb-12">
            <p className="text-gray-400 font-bold italic">ไม่พบข้อมูลการลาของพนักงานในช่วงที่เลือก</p>
          </div>
        )}

      </div>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
        <h3 className="text-lg font-black text-gray-900 mb-2 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7h2a2 2 0 012 2v8a2 2 0 01-2 2H3V7zm16 0h2v12h-2a2 2 0 01-2-2V9a2 2 0 012-2zM9 5h6v14H9z"
              />
            </svg>
          </div>
          รายงานสรุปวันลาของพนักงานในสังกัด
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          แสดงจำนวนวันลาที่ใช้ไป แยกตามประเภทการลา (นับเฉพาะวันทำงาน) — เรียงจากคนที่ลามากสุดก่อน
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
          <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">เงื่อนไขการค้นหา:</span>
          <div className="inline-flex bg-white rounded-xl p-1 border border-indigo-200 shadow-sm">
            <button type="button" onClick={() => setReportScope('month')} className={reportScope === 'month' ? 'px-4 py-2 rounded-lg text-xs font-black bg-indigo-600 text-white shadow' : 'px-4 py-2 rounded-lg text-xs font-black text-gray-500 hover:text-gray-700'}>ระบุเดือน</button>
            <button type="button" onClick={() => setReportScope('year')} className={reportScope === 'year' ? 'px-4 py-2 rounded-lg text-xs font-black bg-indigo-600 text-white shadow' : 'px-4 py-2 rounded-lg text-xs font-black text-gray-500 hover:text-gray-700'}>ทั้งปี</button>
          </div>
          {reportScope === 'month' && (() => {
            const [rmYear, rmMonth] = reportMonth.split('-').map(Number);
            return (
              <div className="flex items-center gap-2">
                <select
                  value={rmMonth || 1}
                  onChange={(e) => setReportMonth(`${rmYear}-${String(parseInt(e.target.value, 10)).padStart(2, '0')}`)}
                  className="px-3 py-2 rounded-xl border-2 border-indigo-200 text-sm font-bold text-gray-800 outline-none focus:border-indigo-500 bg-white"
                >
                  {THAI_MONTHS_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select
                  value={rmYear || currentCEYear()}
                  onChange={(e) => setReportMonth(`${e.target.value}-${String(rmMonth || 1).padStart(2, '0')}`)}
                  className="px-3 py-2 rounded-xl border-2 border-indigo-200 text-sm font-bold text-gray-800 outline-none focus:border-indigo-500 bg-white"
                >
                  {[0, 1, 2].map((offset) => {
                    const ce = currentCEYear() - offset;
                    return <option key={ce} value={ce}>พ.ศ. {toBuddhistYear(ce)}</option>;
                  })}
                </select>
              </div>
            );
          })()}
          {reportScope === 'year' && (
            <select
              value={reportYear}
              onChange={(e) => setReportYear(parseInt(e.target.value, 10))}
              className="px-4 py-2 rounded-xl border-2 border-indigo-200 text-sm font-bold text-gray-800 outline-none focus:border-indigo-500 bg-white"
            >
              {[0, 1, 2].map((offset) => {
                const ce = currentCEYear() - offset;
                const label = offset === 0 ? `พ.ศ. ${toBuddhistYear(ce)} (ปีปัจจุบันทั้งหมด)` : `พ.ศ. ${toBuddhistYear(ce)}`;
                return <option key={ce} value={ce}>{label}</option>;
              })}
            </select>
          )}
        </div>

        {pivotData.length === 0 ? (
          <div className="py-10 text-center text-gray-400 italic text-sm">
            ไม่พบข้อมูลวันลาสำหรับสรุปในปีนี้
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-gray-50">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    พนักงาน
                  </th>
                  {leaveTypes.map((lt) => (
                    <th key={lt.id} className="px-4 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                      {lt.label}
                    </th>
                  ))}
                  <th className="px-4 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                    รวมวันลา
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pivotData.map((row) => {
                  const total = leaveTypes.reduce((sum, lt) => sum + (row.byType[lt.id] || 0), 0);
                  return (
                    <tr key={row.userId} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-3">
                        <p className="text-sm font-black text-gray-900">{row.userName}</p>
                      </td>
                      {leaveTypes.map((lt) => (
                        <td key={lt.id} className="px-4 py-3 text-right text-xs font-bold text-gray-800">
                          {row.byType[lt.id] ? row.byType[lt.id].toFixed(2) : '-'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right text-xs font-black text-blue-700">
                        {total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
        <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </div>
          รายงานประวัติการลาของพนักงานในสังกัด
        </h3>

        <div className="flex flex-col gap-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                ตัวกรอง:
              </span>
              <input
                type="text"
                placeholder="ค้นหาชื่อพนักงาน (บางส่วนของชื่อ)..."
                value={historyNameQuery}
                onChange={(e) => setHistoryNameQuery(e.target.value)}
                className="px-3 py-2 rounded-2xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500 w-56 md:w-72"
              />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex bg-gray-100 rounded-2xl p-1">
                <button
                  onClick={() => setHistoryViewMode('list')}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black ${
                    historyViewMode === 'list'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  มุมมองรายการ
                </button>
                <button
                  onClick={() => setHistoryViewMode('calendar')}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black ${
                    historyViewMode === 'calendar'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  มุมมองปฏิทินรายเดือน
                </button>
              </div>

            {historyViewMode === 'calendar' && (
              <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <button
                  type="button"
                  onClick={() => changeMonth('prev')}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                >
                  ‹
                </button>
                <span>{calendarData.label}</span>
                <button
                  type="button"
                  onClick={() => changeMonth('next')}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
        </div>

        {historyViewMode === 'list' && (
          <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">ช่วงเวลาที่แสดง:</span>
            <div className="inline-flex bg-white rounded-xl p-1 border border-blue-200 shadow-sm">
              <button type="button" onClick={() => setReportScope('month')} className={reportScope === 'month' ? 'px-4 py-2 rounded-lg text-xs font-black bg-blue-600 text-white shadow' : 'px-4 py-2 rounded-lg text-xs font-black text-gray-500 hover:text-gray-700'}>ระบุเดือน</button>
              <button type="button" onClick={() => setReportScope('year')} className={reportScope === 'year' ? 'px-4 py-2 rounded-lg text-xs font-black bg-blue-600 text-white shadow' : 'px-4 py-2 rounded-lg text-xs font-black text-gray-500 hover:text-gray-700'}>ทั้งปี</button>
            </div>
            {reportScope === 'month' && (() => {
              const [rmYear, rmMonth] = reportMonth.split('-').map(Number);
              return (
                <div className="flex items-center gap-2">
                  <select
                    value={rmMonth || 1}
                    onChange={(e) => setReportMonth(`${rmYear}-${String(parseInt(e.target.value,10)).padStart(2,'0')}`)}
                    className="px-3 py-2 rounded-xl border-2 border-blue-200 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-white"
                  >
                    {THAI_MONTHS_FULL.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                  <select
                    value={rmYear || currentCEYear()}
                    onChange={(e) => setReportMonth(`${e.target.value}-${String(rmMonth||1).padStart(2,'0')}`)}
                    className="px-3 py-2 rounded-xl border-2 border-blue-200 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-white"
                  >
                    {[0,1,2].map(offset => {
                      const ce = currentCEYear() - offset;
                      return <option key={ce} value={ce}>พ.ศ. {toBuddhistYear(ce)}</option>;
                    })}
                  </select>
                </div>
              );
            })()}
            {reportScope === 'year' && (
              <select
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value, 10))}
                className="px-4 py-2 rounded-xl border-2 border-blue-200 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-white"
              >
                {[0,1,2].map(offset => {
                  const ce = currentCEYear() - offset;
                  return <option key={ce} value={ce}>พ.ศ. {toBuddhistYear(ce)}</option>;
                })}
              </select>
            )}
          </div>
        )}
        {historyViewMode === 'list' && (
          <div className="overflow-x-auto rounded-3xl border border-gray-50">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">พนักงาน</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">ประเภท</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">วันที่ลา / ระยะเวลา</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">เหตุผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historyTableRequests.map((r) => {
                  const days = calculateBusinessDaysRange(r.startDate, r.endDate);
                  return (
                  <tr key={r.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-gray-900">{r.userName}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                        {leaveTypes.find(t => t.id === r.type)?.label ?? r.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[10px] font-bold text-gray-700">
                        {formatThaiDate(r.startDate)} ถึง {formatThaiDate(r.endDate)}
                      </p>
                      <p className="text-[10px] font-bold text-blue-600 mt-0.5">
                        {formatDurationLabel(days)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-500 italic truncate max-w-xs">{r.reason}</p>
                    </td>
                  </tr>
                  );
                })}
                {historyTableRequests.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-gray-400 italic text-sm">
                      ไม่พบข้อมูลประวัติการลา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {historyViewMode === 'calendar' && (
          <div className="mt-4 rounded-3xl border border-gray-100 p-4">
            {/* Info bar: แสดงจำนวนคำขอลาทั้งหมดที่โหลดได้ */}
            {calendarBaseRequests.length === 0 ? (
              <div className="mb-3 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>ไม่พบคำขอลาของพนักงานใต้สายบังคับบัญชา — โปรดตรวจสอบว่าพนักงานได้ยื่นคำขอลาแล้ว</span>
              </div>
            ) : (
              <div className="mb-3 px-4 py-2 rounded-xl bg-blue-50 border border-blue-100 text-xs font-bold text-blue-700 flex items-center gap-2">
                <span>📅</span>
                <span>พบคำขอลา {calendarBaseRequests.length} รายการ — {calendarBaseRequests.map(r => r.userName).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
              </div>
            )}
            {calendarData.days.length === 0 ? (
              <div className="py-10 text-center text-gray-400 italic text-sm">
                ไม่พบข้อมูลการลาในเดือนนี้
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-7 gap-2 text-[10px] font-black uppercase tracking-widest mb-2">
                  <span className="text-center text-rose-400">อา</span>
                  <span className="text-center text-gray-400">จ</span>
                  <span className="text-center text-gray-400">อ</span>
                  <span className="text-center text-gray-400">พ</span>
                  <span className="text-center text-gray-400">พฤ</span>
                  <span className="text-center text-gray-400">ศ</span>
                  <span className="text-center text-blue-400">ส</span>
                </div>
                <div className="grid grid-cols-7 gap-2 text-xs">
                  {calendarData.days.map((day) => (
                    <div
                      key={day.iso}
                      className={`min-h-[80px] rounded-2xl border p-2 flex flex-col gap-1 ${
                        day.inMonth
                          ? day.holidayName
                            ? 'bg-amber-50 border-amber-200'
                            : day.isWeekend
                            ? 'bg-gray-100 border-gray-200'
                            : 'bg-white border-gray-100'
                          : 'bg-gray-50 border-gray-100 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-[9px] font-black text-gray-400 uppercase">
                          {day.holidayName && 'HOL'}
                        </div>
                        <div className="text-[11px] font-black text-gray-700">
                          {day.dayOfMonth}
                        </div>
                      </div>
                      {day.holidayName && (
                        <div className="text-[9px] text-amber-700 font-bold leading-tight">
                          {day.holidayName}
                        </div>
                      )}
                      <div className="space-y-0.5 mt-auto">
                        {day.leaves.slice(0, 3).map((l, idx) => (
                          <div
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold truncate"
                            title={`${l.userName} • ${leaveTypes.find(t => t.id === l.type)?.label ?? l.type}`}
                          >
                            {l.userName.split(' ')[0]} • {leaveTypes.find(t => t.id === l.type)?.label ?? l.type}
                          </div>
                        ))}
                        {day.leaves.length > 3 && (
                          <div className="text-[9px] text-gray-400 font-bold">
                            +{day.leaves.length - 3} คน
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportSummary;
