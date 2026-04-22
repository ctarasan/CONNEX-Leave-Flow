
import React, { useEffect, useMemo, useState } from 'react';
import { User, UserRole } from '../types';
import { calculateLatePenaltyDays, getAttendanceRecords, getAllUsers, getSubordinateIdSetRecursive, loadAttendanceForUser } from '../store';
import { isApiMode } from '../api';
import DatePicker from './DatePicker';
import { formatYmdAsDdMmBe, formatTimeAsHm } from '../utils';
import TablePagination, { useTablePagination } from './TablePagination';
import { FIELD_MAX_LENGTHS } from '../constants';

interface TeamAttendanceProps {
  manager: User;
}

/** แสดงระยะเวลาระหว่างเวลาเข้า–ออก เป็น "X ชั่วโมง Y นาที" (ไม่ใช่ทศนิยมชั่วโมง) */
const formatWorkDurationThai = (dateStr: string, checkIn?: string | null, checkOut?: string | null): string => {
  if (!checkIn || !checkOut) return '-';
  const start = new Date(`${dateStr}T${checkIn}`);
  const end = new Date(`${dateStr}T${checkOut}`);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return '-';
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0 && m === 0) return '-';
  if (h === 0) return `${m} นาที`;
  if (m === 0) return `${h} ชั่วโมง`;
  return `${h} ชั่วโมง ${m} นาที`;
};

const TeamAttendance: React.FC<TeamAttendanceProps> = ({ manager }) => {
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }, [today]);
  const monthEnd = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }, [today]);

  const allUsers = useMemo(() => getAllUsers(), []);
  const subordinates = useMemo(() => {
    if (manager.role === UserRole.ADMIN) return allUsers;
    const subordinateSet = getSubordinateIdSetRecursive(manager.id, allUsers);
    return allUsers.filter(u => subordinateSet.has(u.id));
  }, [allUsers, manager]);

  const [reloadTick, setReloadTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [nameQuery, setNameQuery] = useState('');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(monthEnd);

  useEffect(() => {
    if (!isApiMode() || subordinates.length === 0) return;
    setIsLoading(true);
    Promise.all(subordinates.map(s => loadAttendanceForUser(s.id)))
      .finally(() => {
        setReloadTick(t => t + 1);
        setIsLoading(false);
      });
  }, [subordinates]);

  const teamRecords = useMemo(() => {
    const allAttendance = isApiMode()
      ? subordinates.flatMap(s => getAttendanceRecords(s.id))
      : getAttendanceRecords().filter(r => subordinates.some(s => s.id === r.userId));
    return allAttendance
      .map(r => ({
        ...r,
        userName: subordinates.find(s => s.id === r.userId)?.name || 'Unknown',
        department: subordinates.find(s => s.id === r.userId)?.department || '-'
      }))
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        const byName = a.userName.localeCompare(b.userName, 'th');
        if (byName !== 0) return byName;
        const byIn = (a.checkIn ?? '').localeCompare(b.checkIn ?? '');
        if (byIn !== 0) return byIn;
        return String(a.id).localeCompare(String(b.id));
      });
  }, [subordinates, reloadTick]);

  const filteredRecords = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return teamRecords.filter((rec) => {
      if (q && !rec.userName.toLowerCase().includes(q)) return false;
      if (startDate && rec.date < startDate) return false;
      if (endDate && rec.date > endDate) return false;
      return true;
    });
  }, [teamRecords, nameQuery, startDate, endDate]);
  const attendancePagination = useTablePagination(filteredRecords);

  return (
    <div className="bg-white rounded-[32px] shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-black text-gray-900">การเข้างานของทีม</h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500"></div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">มาสาย</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">ปกติ</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            <div className="flex flex-col">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                ชื่อพนักงาน (Max Length = {FIELD_MAX_LENGTHS.searchText})
              </label>
              <input
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                maxLength={FIELD_MAX_LENGTHS.searchText}
                placeholder="พิมพ์ชื่อหรือบางส่วนของชื่อ..."
                className="px-3 py-2 rounded-2xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500 w-full"
              />
            </div>
            <div className="w-full sm:w-[220px]">
              <DatePicker
                label="จากวันที่"
                value={startDate}
                onChange={setStartDate}
                maxDate={endDate || undefined}
              />
            </div>
            <div className="w-full sm:w-[220px]">
              <DatePicker
                label="ถึงวันที่"
                value={endDate}
                onChange={setEndDate}
                minDate={startDate || undefined}
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                พนักงาน
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                วันที่
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                เวลาเข้า (IN)
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                เวลาออก (OUT)
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                ชั่วโมงทำงาน
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                สถานะ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {attendancePagination.pagedItems.map((rec) => {
              const hoursText = formatWorkDurationThai(rec.date, rec.checkIn, rec.checkOut);

              return (
                <tr key={rec.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="font-black text-gray-900 text-sm">{rec.userName}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{rec.department}</div>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-gray-700 text-sm">
                    {formatYmdAsDdMmBe(rec.date)}
                  </td>
                  <td
                    className={`px-6 py-4 text-center font-black text-sm ${
                      rec.isLate ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {formatTimeAsHm(rec.checkIn)}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-gray-900 text-sm">
                    {formatTimeAsHm(rec.checkOut)}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-gray-800 text-sm">
                    {hoursText}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {rec.isLate ? (
                      <div className="flex flex-col items-end">
                        <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase">
                          มาสาย
                        </span>
                        <span className="text-[9px] text-rose-400 font-bold mt-1 tracking-tighter">
                          หักพักร้อน {calculateLatePenaltyDays(rec.checkIn)} วัน
                        </span>
                      </div>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase">
                        ปกติ
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredRecords.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-20 text-center text-gray-400 font-bold italic"
                >
                  ไม่พบประวัติการเข้างานของพนักงานในทีมตามเงื่อนไขที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination
          page={attendancePagination.page}
          pageSize={attendancePagination.pageSize}
          totalItems={attendancePagination.totalItems}
          totalPages={attendancePagination.totalPages}
          rangeStart={attendancePagination.rangeStart}
          rangeEnd={attendancePagination.rangeEnd}
          onPageChange={attendancePagination.setPage}
          onPageSizeChange={attendancePagination.setPageSize}
          leftOffsetPx={38}
          rightOffsetPx={-38}
        />
        {isLoading && (
          <div className="px-6 py-4 text-center text-gray-500 text-xs font-bold">
            กำลังโหลดข้อมูลการเข้างานของทีม...
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamAttendance;
