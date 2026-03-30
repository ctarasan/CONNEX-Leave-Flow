import React, { useState, useMemo, useEffect } from 'react';
import { User, LeaveStatus } from '../types';
import { useAlert } from '../AlertContext';
import { HOLIDAYS_2026 } from '../constants';
import { saveLeaveRequest, getLeaveRequests, getLeaveTypesForGender, getDefaultQuotaForLeaveType } from '../store';
import DatePicker from './DatePicker';

interface LeaveFormProps {
  user: User;
  onSuccess: () => void;
}

const LeaveForm: React.FC<LeaveFormProps> = ({ user, onSuccess }) => {
  const { showAlert } = useAlert();
  const leaveTypeOptions = useMemo(() => getLeaveTypesForGender(user.gender), [user.gender]);

  const defaultTypeId = leaveTypeOptions.length > 0 ? leaveTypeOptions[0].id : '';
  const [type, setType] = useState<string>(defaultTypeId);

  useEffect(() => {
    if (leaveTypeOptions.length && !leaveTypeOptions.some(t => t.id === type)) setType(leaveTypeOptions[0].id);
  }, [leaveTypeOptions, type]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<Record<string, number>>({});

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
      const isHoliday = !!HOLIDAYS_2026[isoDate];
      if (!isWeekend && !isHoliday) count++;
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  };

  const requestedDays = useMemo(() => calculateBusinessDays(startDate, endDate), [startDate, endDate]);

  useEffect(() => {
    const allRequests = getLeaveRequests();
    const userRequests = allRequests.filter(r => r.userId === user.id && r.status !== LeaveStatus.REJECTED);
    const currentYear = new Date().getFullYear();
    const counts: Record<string, number> = {};
    leaveTypeOptions.forEach(t => { counts[t.id] = 0; });
    userRequests.forEach(req => {
      const start = new Date(req.startDate);
      if (start.getFullYear() === currentYear && counts[req.type] !== undefined) {
        counts[req.type] += calculateBusinessDays(req.startDate, req.endDate);
      }
    });
    setUsage(counts);
  }, [user.id, leaveTypeOptions]);

  /** ช่วงวันสองช่วงซ้อนทับกันหรือไม่ */
  const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    aStart <= bEnd && bStart <= aEnd;

  /** ตรวจสอบว่า "YYYY-MM-DD" เป็นวันหยุดสุดสัปดาห์หรือวันหยุดบริษัทหรือไม่ */
  const isNonWorkingDay = (dateStr: string): { weekend: boolean; holiday: string | undefined } => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // local constructor — ป้องกัน timezone shift
    return { weekend: dow === 0 || dow === 6, holiday: HOLIDAYS_2026[dateStr] };
  };

  const validationMessage = useMemo(() => {
    if (!startDate) return null;

    // ตรวจสอบ startDate
    const startCheck = isNonWorkingDay(startDate);
    if (startCheck.weekend) return 'วันที่เริ่มลาเป็นวันหยุดสุดสัปดาห์ (เสาร์/อาทิตย์) — กรุณาเลือกวันทำการ';
    if (startCheck.holiday) return `วันที่เริ่มลาเป็นวันหยุดนักขัตฤกษ์ (${startCheck.holiday}) — กรุณาเลือกวันทำการ`;

    if (type === 'SICK') {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (startDate > todayStr) return 'ลาป่วยต้องยื่นย้อนหลังเท่านั้น (ไม่สามารถลาล่วงหน้าได้)';
      if (endDate && endDate > todayStr) return 'ลาป่วยต้องยื่นย้อนหลังเท่านั้น (วันที่สิ้นสุดลาต้องไม่เกินวันนี้)';
    }

    if (endDate) {
      // ตรวจสอบ endDate
      const endCheck = isNonWorkingDay(endDate);
      if (endCheck.weekend) return 'วันที่สิ้นสุดลาเป็นวันหยุดสุดสัปดาห์ (เสาร์/อาทิตย์) — กรุณาเลือกวันทำการ';
      if (endCheck.holiday) return `วันที่สิ้นสุดลาเป็นวันหยุดนักขัตฤกษ์ (${endCheck.holiday}) — กรุณาเลือกวันทำการ`;

      if (new Date(startDate) > new Date(endDate)) return 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด';
      if (requestedDays === 0) return 'ช่วงเวลาที่เลือกไม่มีวันทำการ (เป็นวันหยุดทั้งหมด)';
      const allRequests = getLeaveRequests();
      const existing = allRequests.filter(
        r => r.userId === user.id && (r.status === LeaveStatus.PENDING || r.status === LeaveStatus.APPROVED)
      );
      const overlap = existing.some(r => rangesOverlap(startDate, endDate, r.startDate, r.endDate));
      if (overlap) return 'ช่วงวันลาซ้อนทับกับรายการลาที่มีอยู่แล้ว (รออนุมัติหรืออนุมัติแล้ว) กรุณาเลือกช่วงวันอื่น';
      const currentUsage = usage[type] || 0;
      const quota = user.quotas[type] ?? getDefaultQuotaForLeaveType(type);
      if (type !== 'VACATION' && quota > 0 && quota < 999 && (currentUsage + requestedDays) > quota) {
        return `สิทธิการลาประเภทนี้คงเหลือไม่เพียงพอ (ใช้ไปแล้ว ${currentUsage}/${quota} วัน)`;
      }
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, type, usage, user.id, user.quotas, requestedDays]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (validationMessage || !startDate || !endDate || !trimmedReason) return;
    if (trimmedReason.length > 2000) return;
    setLoading(true);
    console.log('🔵 [LeaveForm] กำลังส่งคำขอลา...');
    try {
      const result = await saveLeaveRequest({
        userId: user.id,
        userName: user.name,
        type,
        startDate,
        endDate,
        reason: trimmedReason,
      });
      setLoading(false);
      if (result.ok) {
        console.log('✅ [LeaveForm] ส่งคำขอลาสำเร็จ', result.savedToServer ? 'ลงเซิร์ฟเวอร์' : 'ในเครื่อง');
        onSuccess();
        setStartDate('');
        setEndDate('');
        setReason('');
        const daysText = `จำนวน ${requestedDays} วันทำการ`;
        if (result.savedToServer) {
          showAlert(`ส่งใบลาเรียบร้อยแล้ว (${daysText}) — บันทึกลง Supabase แล้ว`);
        } else {
          showAlert(`ส่งใบลาเรียบร้อยแล้ว (${daysText}) — บันทึกเฉพาะในเครื่องนี้ ไม่ได้ส่งไป Supabase (ตั้ง VITE_API_URL แล้ว Redeploy เพื่อเชื่อมเซิร์ฟเวอร์)`);
        }
      } else {
        console.error('❌ [LeaveForm] ส่งคำขอลาล้มเหลว:', result.error);
        showAlert(result.error);
      }
    } catch (err) {
      setLoading(false);
      console.error('❌ [LeaveForm] Error:', err);
      showAlert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  if (leaveTypeOptions.length === 0) {
    return (
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
        <p className="text-gray-500 text-sm">ไม่มีประเภทวันลาที่ใช้กับคุณในขณะนี้</p>
      </div>
    );
  }

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const isSickLeave = type === 'SICK';

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
      <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
        <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </div>
        ส่งใบขอลาหยุด
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">ประเภทการลา</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full p-4 bg-white border-2 border-gray-200 rounded-2xl focus:border-blue-500 outline-none transition text-sm font-bold text-gray-800"
          >
            {leaveTypeOptions.map(lt => (
              <option key={lt.id} value={lt.id}>{lt.label}</option>
            ))}
          </select>
          {isSickLeave && (
            <p className="mt-2 text-[10px] text-amber-600 font-bold">ลาป่วยยื่นย้อนหลังเท่านั้น (หายป่วยแล้วกลับเข้าทำงาน จึงยื่นลาได้ ไม่สามารถลาล่วงหน้าได้)</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DatePicker
            label="จากวันที่"
            value={startDate}
            onChange={setStartDate}
            minDate={isSickLeave ? undefined : todayStr}
            maxDate={isSickLeave ? todayStr : undefined}
          />
          <DatePicker
            label="ถึงวันที่"
            value={endDate}
            onChange={setEndDate}
            minDate={startDate || (isSickLeave ? undefined : todayStr)}
            maxDate={isSickLeave ? todayStr : undefined}
          />
        </div>

        {startDate && endDate && requestedDays > 0 && (
          <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 uppercase tracking-widest">วันทำงานที่ใช้:</span>
            <span className="text-xl font-black text-blue-600">{requestedDays} วัน</span>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">เหตุผลประกอบการลา</label>
          <textarea required rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full p-4 bg-white border-2 border-gray-200 rounded-2xl focus:border-blue-500 outline-none transition text-sm font-bold text-gray-800 placeholder:text-gray-300" placeholder="โปรระบุรายละเอียด..." aria-describedby="reason-hint" />
          <p id="reason-hint" className="text-[10px] text-gray-400 mt-1">{reason.length}/2000</p>
        </div>

        {validationMessage && (
          <div className="p-4 bg-rose-50 text-rose-800 text-xs rounded-2xl border border-rose-100 font-bold flex gap-3 items-center">
            <svg className="w-5 h-5 shrink-0 text-rose-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            {validationMessage}
          </div>
        )}

        <button type="submit" disabled={loading || !!validationMessage || !startDate || !endDate} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 transition disabled:opacity-40 shadow-xl shadow-blue-100 active:scale-[0.98]">
          {loading ? 'กำลังประมวลผล...' : 'ยืนยันการส่งใบลา'}
        </button>
      </form>
    </div>
  );
};

export default LeaveForm;
