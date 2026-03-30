import React, { useState, useEffect, useMemo } from 'react';
import { User, AttendanceRecord } from '../types';
import { saveAttendance, getAttendanceRecords } from '../store';
import { useAlert } from '../AlertContext';
import { isApiMode, getAttendanceVerifyNetwork } from '../api';
import { todayLocalYmd, formatYmdAsDdMmBe } from '../utils';

interface AttendanceModuleProps {
  user: User;
  onUpdate: () => void;
}

const AttendanceModule: React.FC<AttendanceModuleProps> = ({ user, onUpdate }) => {
  const { showAlert } = useAlert();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'IDLE' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    setRecords(getAttendanceRecords(user.id));
    return () => clearInterval(timer);
  }, [user.id]);

  const getLocalDateString = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const todayRecord = useMemo(() => {
    const todayStr = getLocalDateString(new Date());
    return records.find(r => r.date === todayStr);
  }, [records]);
  const hasCheckedInToday = !!todayRecord?.checkIn;
  const hasCheckedOutToday = !!todayRecord?.checkOut;
  const canCheckIn = verificationStatus === 'SUCCESS' && !isSubmitting && (!hasCheckedInToday || hasCheckedOutToday);
  const canCheckOut = !isSubmitting && hasCheckedInToday && !hasCheckedOutToday;

  const verifyWiFiNetwork = async () => {
    setIsVerifying(true);
    setVerificationStatus('IDLE');
    setStatusMessage('กำลังตรวจสอบเครือข่าย...');

    if (!isApiMode()) {
      setVerificationStatus('FAILED');
      setStatusMessage(`การตรวจสอบ WiFi "${REQUIRED_SSID}" ใช้ได้เมื่อแอปเชื่อมต่อเซิร์ฟเวอร์บริษัท กรุณาเชื่อมต่อ WiFi ออฟฟิศ`);
      setIsVerifying(false);
      return;
    }

    try {
      const { allowed, clientIp } = await getAttendanceVerifyNetwork();
      if (allowed) {
        setVerificationStatus('SUCCESS');
        setStatusMessage('เชื่อมต่อสำเร็จ: อยู่บนเครือข่ายออฟฟิศ — สามารถลงเวลาได้');
      } else {
        setVerificationStatus('FAILED');
        setStatusMessage(clientIp
          ? 'ตรวจสอบไม่ผ่าน: ไม่อยู่บนเครือข่ายออฟฟิศ — กรุณาเชื่อมต่อ WiFi ออฟฟิศเท่านั้น'
          : 'ตรวจสอบไม่ผ่าน: กรุณาเชื่อมต่อ WiFi ออฟฟิศ — ลงเวลาได้เฉพาะที่ออฟฟิศ');
      }
    } catch {
      setVerificationStatus('FAILED');
      setStatusMessage('ตรวจสอบไม่ผ่าน: ไม่สามารถยืนยันเครือข่ายได้ — กรุณาเชื่อมต่อ WiFi ออฟฟิศ');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAction = async (type: 'IN' | 'OUT') => {
    if (type === 'IN' && verificationStatus !== 'SUCCESS') {
      showAlert('กรุณาเชื่อมต่อ WiFi ออฟฟิศ แล้วกด "ตรวจสอบเครือข่าย WiFi" ให้ผ่านก่อนลงเวลา');
      return;
    }
    if (type === 'OUT' && !hasCheckedInToday) {
      showAlert('ต้องเช็คอินก่อนจึงจะเช็คเอาท์ได้');
      return;
    }
    try {
      setIsSubmitting(true);
      const result = saveAttendance(user.id, type);
      const record = typeof (result as Promise<unknown>)?.then === 'function'
        ? await (result as Promise<AttendanceRecord>)
        : result as AttendanceRecord;
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.date === record.date);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...record };
          return next;
        }
        return [record, ...prev];
      });
      onUpdate();
      showAlert(type === 'IN' ? 'บันทึกเวลาเช็คอินสำเร็จ' : 'บันทึกเวลาเช็คเอาท์สำเร็จ');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ลงเวลาไม่สำเร็จ';
      showAlert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-8 items-center">
          {/* Left: Time & Verification */}
          <div className="flex-1 text-center space-y-6">
            <div className="space-y-1">
              <p className="text-5xl font-black text-blue-600 tracking-tighter">
                {currentTime.toLocaleTimeString('th-TH', { hour12: false })}
              </p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {formatYmdAsDdMmBe(todayLocalYmd())}
              </p>
            </div>

            <div className={`p-6 rounded-3xl border-2 transition-all ${
              verificationStatus === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200' :
              verificationStatus === 'FAILED' ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-100'
            }`}>
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  verificationStatus === 'SUCCESS' ? 'bg-emerald-100 text-emerald-600' :
                  verificationStatus === 'FAILED' ? 'bg-rose-100 text-rose-600' : 'bg-white text-gray-400'
                }`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ระบบตรวจสอบเครือข่ายไร้สาย</p>
                  <p className="text-xs font-bold text-gray-700 leading-tight">
                    {statusMessage || 'ลงเวลาได้เฉพาะเมื่อเชื่อมต่อ WiFi ออฟฟิศ — กดปุ่มด้านล่างเพื่อตรวจสอบ'}
                  </p>
                </div>
              </div>

              <button 
                onClick={verifyWiFiNetwork}
                disabled={isVerifying}
                className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition shadow-sm disabled:opacity-50"
              >
                {isVerifying ? 'กำลังตรวจสอบ...' : 'ตรวจสอบเครือข่าย WiFi'}
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="w-full md:w-72 space-y-4">
            <button 
              onClick={() => handleAction('IN')}
              disabled={!canCheckIn}
              className="w-full h-24 bg-emerald-600 text-white rounded-[32px] font-black text-xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition disabled:opacity-30 disabled:grayscale transform active:scale-95"
            >
              เช็คอิน (IN)
            </button>
            <button 
              onClick={() => handleAction('OUT')}
              disabled={!canCheckOut}
              className="w-full h-24 bg-blue-600 text-white rounded-[32px] font-black text-xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition disabled:opacity-30 disabled:grayscale transform active:scale-95"
            >
              เช็คเอาท์ (OUT)
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
        <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          ความปลอดภัยเครือข่าย
        </h4>
        <p className="text-xs text-blue-700 font-medium leading-relaxed">
          ลงเวลาได้เฉพาะเมื่อเชื่อมต่อ <strong>WiFi ออฟฟิศ</strong> เท่านั้น ระบบจะตรวจสอบเครือข่ายก่อนลงเวลา — ถ้าไม่อยู่บนเครือข่ายออฟฟิศจะตรวจสอบไม่ผ่านและไม่สามารถลงเวลาได้ กรุณาตรวจสอบว่าไม่ได้ใช้ VPN หรือ Mobile Hotspot ขณะลงเวลา
        </p>
      </div>
    </div>
  );
};

export default AttendanceModule;
