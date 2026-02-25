
import React, { useState } from 'react';
import { LeaveRequest, LeaveStatus } from '../types';
import { STATUS_COLORS, STATUS_LABELS, HOLIDAYS_2026 } from '../constants';
import { updateRequestStatus, getLeaveTypes } from '../store';
import { formatThaiDate, formatThaiDateTime } from '../utils';

interface ApprovalBoardProps {
  requests: LeaveRequest[];
  currentUserId: string;
  onUpdate: () => void;
}

const ApprovalBoard: React.FC<ApprovalBoardProps> = ({ requests, currentUserId, onUpdate }) => {
  const [comment, setComment] = useState('');
  const pendingRequests = requests.filter(r => r.status === LeaveStatus.PENDING);

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

  const handleAction = (id: string, status: LeaveStatus) => {
    updateRequestStatus(id, status, comment, currentUserId);
    setComment('');
    onUpdate();
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          คำขอที่รอการอนุมัติ
        </h2>
        <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded-lg">
          {pendingRequests.length} รายการ
        </span>
      </div>
      
      {pendingRequests.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
          <p className="text-gray-400 font-bold text-sm">ไม่มีคำขอที่ค้างอยู่</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingRequests.map(req => {
            const days = calculateBusinessDays(req.startDate, req.endDate);
            const found = getLeaveTypes().find(t => t.id === req.type);
const typeLabel = (found?.label && found.label.trim()) ? found.label : req.type || '—';
            return (
              <div key={req.id} className="p-5 border-2 border-gray-50 rounded-2xl hover:border-blue-100 transition bg-white shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-black text-gray-900 text-base">{req.userName}</h3>
                    <p className="text-xs font-bold text-blue-600 bg-blue-50 inline-block px-2 py-1 rounded-md mt-1">
                      {typeLabel} • {days} วันทำการ
                    </p>
                    {req.submittedAt && (
                      <p className="text-[10px] text-gray-500 font-medium mt-1.5">
                        ส่งเมื่อ: {formatThaiDateTime(req.submittedAt)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">ระยะเวลา</p>
                    <p className="text-xs font-bold text-gray-700">{formatThaiDate(req.startDate)} ถึง {formatThaiDate(req.endDate)}</p>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-700 italic mb-5 border border-gray-100">
                  <span className="text-gray-400 not-italic font-bold text-[10px] block mb-1 uppercase">เหตุผลการลา:</span>
                  "{req.reason}"
                </div>
                
                <div className="space-y-3">
                  <input 
                    type="text" 
                    placeholder="ใส่ความเห็นเพิ่มเติมเพื่อแจ้งพนักงาน..."
                    className="w-full p-3 text-sm bg-white border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 font-bold"
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleAction(req.id, LeaveStatus.APPROVED)}
                      className="flex-1 bg-emerald-600 text-white py-3 rounded-xl text-sm font-black hover:bg-emerald-700 transition shadow-lg shadow-emerald-100"
                    >
                      อนุมัติ
                    </button>
                    <button 
                      onClick={() => handleAction(req.id, LeaveStatus.REJECTED)}
                      className="flex-1 bg-rose-600 text-white py-3 rounded-xl text-sm font-black hover:bg-rose-700 transition shadow-lg shadow-rose-100"
                    >
                      ไม่อนุมัติ
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApprovalBoard;
