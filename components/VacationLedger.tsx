
import React, { useMemo } from 'react';
import { User, LeaveRequest, AttendanceRecord, LeaveStatus } from '../types';
import { getLeaveRequests, getAttendanceRecords, getLeaveTypes } from '../store';
import { HOLIDAYS_2026 } from '../constants';
import { formatThaiDate } from '../utils';

interface VacationLedgerProps {
  user: User;
}

interface LedgerEntry {
  id: string;
  date: string;
  type: 'LEAVE' | 'PENALTY';
  description: string;
  amount: number;
  timestamp: string;
}

const VacationLedger: React.FC<VacationLedgerProps> = ({ user }) => {
  // ฟังก์ชันคำนวณวันทำการ (เหมือนใน LeaveForm)
  const calculateBusinessDays = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    let count = 0;
    const curDate = new Date(start.getTime());
    while (curDate <= end) {
      const dayOfWeek = curDate.getDay();
      const isoDate = curDate.toISOString().split('T')[0];
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !HOLIDAYS_2026[isoDate]) count++;
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  };

  const ledgerEntries = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const requests = getLeaveRequests().filter(r =>
      r.userId === user.id &&
      r.type === 'VACATION' &&
      r.status === LeaveStatus.APPROVED &&
      new Date(r.startDate).getFullYear() === currentYear
    );

    const attendance = getAttendanceRecords(user.id).filter(a =>
      a.isLate && a.penaltyApplied && new Date(a.date).getFullYear() === currentYear
    );

    const entries: LedgerEntry[] = [
      ...requests.map(r => ({
        id: r.id,
        date: r.startDate,
        type: 'LEAVE' as const,
        description: `ลาพักร้อน (${formatThaiDate(r.startDate)} ถึง ${formatThaiDate(r.endDate)})`,
        amount: calculateBusinessDays(r.startDate, r.endDate),
        timestamp: r.reviewedAt || r.submittedAt
      })),
      ...attendance.map(a => ({
        id: a.id,
        date: a.date,
        type: 'PENALTY' as const,
        description: `หักจากการเข้างานสาย (${a.checkIn})`,
        amount: 0.25,
        timestamp: `${a.date}T${a.checkIn}`
      }))
    ];

    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [user.id]);

  const totalDeducted = useMemo(() => ledgerEntries.reduce((sum, e) => sum + e.amount, 0), [ledgerEntries]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Summary Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">สิทธิพักร้อนทั้งหมด (ปีนี้)</p>
          <p className="text-2xl font-black text-gray-900">12.00 <span className="text-sm font-bold text-gray-400">วัน</span></p>
        </div>
        <div className="bg-rose-50 p-6 rounded-[32px] border border-rose-100 shadow-sm">
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">ใช้ไปแล้วรวม</p>
          <p className="text-2xl font-black text-rose-600">-{totalDeducted.toFixed(2)} <span className="text-sm font-bold text-rose-400">วัน</span></p>
        </div>
        <div className="bg-blue-600 p-6 rounded-[32px] text-white shadow-xl shadow-blue-100">
          <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-1">คงเหลือปัจจุบัน</p>
          <p className="text-2xl font-black">{(12 - totalDeducted).toFixed(2)} <span className="text-sm font-bold text-blue-200">วัน</span></p>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-black text-gray-900">รายละเอียดการเคลื่อนไหววันลาพักร้อน</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">วันที่ทำรายการ</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">รายการ</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">ประเภท</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">จำนวนหัก (วัน)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ledgerEntries.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-bold text-gray-700 text-sm">
                    {new Date(entry.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-black text-gray-900">{entry.description}</p>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Transaction ID: {entry.id}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {entry.type === 'LEAVE' ? (
                      <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase">การลาปกติ</span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter">หักมาสาย (Auto)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`text-sm font-black ${entry.type === 'PENALTY' ? 'text-amber-600' : 'text-rose-600'}`}>
                      -{entry.amount.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
              {ledgerEntries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-gray-400 font-bold italic text-sm">ไม่พบประวัติการหักวันลาพักร้อน</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
        <div className="flex gap-4 items-start">
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-blue-600 border border-gray-100 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">กฎระเบียบบริษัท</p>
            <ul className="text-[11px] text-gray-500 font-medium space-y-1">
              <li>• การมาสายหลังเวลา 09:30 น. จะถูกหักโควต้าพักร้อน 0.25 วัน ต่อครั้งโดยอัตโนมัติ</li>
              <li>• หากโควต้าพักร้อนหมด ระบบจะนำไปหักจากเบี้ยขยันหรือวันหยุดชดเชยตามลำดับ</li>
              <li>• พนักงานสามารถอุทธรณ์รายการหักอัตโนมัติได้ภายใน 3 วันทำการ หากเกิดจากเหตุสุดวิสัย</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VacationLedger;
