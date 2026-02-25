
import React, { useMemo, useState } from 'react';
import { User, UserRole } from '../types';
import { getAttendanceRecords, getAllUsers, getSubordinateIdSetRecursive } from '../store';

interface TeamAttendanceProps {
  manager: User;
}

const TeamAttendance: React.FC<TeamAttendanceProps> = ({ manager }) => {
  const allUsers = useMemo(() => getAllUsers(), []);
  const subordinates = useMemo(() => {
    if (manager.role === UserRole.ADMIN) return allUsers;
    const subordinateSet = getSubordinateIdSetRecursive(manager.id, allUsers);
    return allUsers.filter(u => subordinateSet.has(u.id));
  }, [allUsers, manager]);

  const teamRecords = useMemo(() => {
    const allAttendance = getAttendanceRecords();
    const subIds = subordinates.map(s => s.id);
    return allAttendance
      .filter(r => subIds.includes(r.userId))
      .map(r => ({
        ...r,
        userName: subordinates.find(s => s.id === r.userId)?.name || 'Unknown',
        department: subordinates.find(s => s.id === r.userId)?.department || '-'
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [subordinates]);

  const [nameQuery, setNameQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredRecords = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return teamRecords.filter((rec) => {
      if (q && !rec.userName.toLowerCase().includes(q)) return false;
      if (startDate && rec.date < startDate) return false;
      if (endDate && rec.date > endDate) return false;
      return true;
    });
  }, [teamRecords, nameQuery, startDate, endDate]);

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
                ชื่อพนักงาน
              </label>
              <input
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="พิมพ์ชื่อหรือบางส่วนของชื่อ..."
                className="px-3 py-2 rounded-2xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500 w-full"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                จากวันที่
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 rounded-2xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                ถึงวันที่
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-2xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
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
            {filteredRecords.map((rec) => {
              let hoursText = '-';
              if (rec.checkIn && rec.checkOut) {
                const start = new Date(`${rec.date}T${rec.checkIn}`);
                const end = new Date(`${rec.date}T${rec.checkOut}`);
                const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                if (diff > 0) {
                  hoursText = diff.toFixed(2);
                }
              }

              return (
                <tr key={rec.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="font-black text-gray-900 text-sm">{rec.userName}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">{rec.department}</div>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-gray-700 text-sm">
                    {new Date(rec.date).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td
                    className={`px-6 py-4 text-center font-black text-sm ${
                      rec.isLate ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {rec.checkIn || '-'}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-gray-900 text-sm">
                    {rec.checkOut || '-'}
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
                          หักพักร้อน 0.25 วัน
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
      </div>
    </div>
  );
};

export default TeamAttendance;
