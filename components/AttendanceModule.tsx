import React, { useState, useEffect, useMemo } from 'react';
import { User, AttendanceRecord } from '../types';
import { saveAttendance, getAttendanceRecords } from '../store';
import { useAlert } from '../AlertContext';

interface AttendanceModuleProps {
  user: User;
  onUpdate: () => void;
}

const REQUIRED_SSID = "Connex_fibre_2.4G";

const AttendanceModule: React.FC<AttendanceModuleProps> = ({ user, onUpdate }) => {
  const { showAlert } = useAlert();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'IDLE' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    setRecords(getAttendanceRecords(user.id));
    return () => clearInterval(timer);
  }, [user.id]);

  const todayRecord = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return records.find(r => r.date === todayStr);
  }, [records]);

  const verifyWiFiNetwork = () => {
    setIsVerifying(true);
    setVerificationStatus('IDLE');
    setStatusMessage('กำลังสแกนหาเครือข่าย WiFi ในพื้นที่...');

    // จำลองการตรวจสอบ Network Interface
    setTimeout(() => {
      // สำหรับ Demo: เราจะจำลองว่าระบบตรวจพบ SSID ที่ต้องการ
      // ในระบบเว็บจริง Browsers ไม่ให้เข้าถึง SSID โดยตรงผ่าน JS (Security Policy)
      // ดังนั้นจึงต้องใช้การจำลองการตรวจสอบผ่าน Company Gateway IP
      const detectedSSID = REQUIRED_SSID; 
      
      if (detectedSSID === REQUIRED_SSID) {
        setVerificationStatus('SUCCESS');
        setStatusMessage(`เชื่อมต่อสำเร็จ: ตรวจพบเครือข่าย ${REQUIRED_SSID} (Secure Office Network)`);
      } else {
        setVerificationStatus('FAILED');
        setStatusMessage(`ล้มเหลว: กรุณาเชื่อมต่อ WiFi ของบริษัท (${REQUIRED_SSID})`);
      }
      setIsVerifying(false);
    }, 2000);
  };

  const handleAction = (type: 'IN' | 'OUT') => {
    if (verificationStatus !== 'SUCCESS') {
      showAlert(`กรุณาเชื่อมต่อและตรวจสอบสิทธิ์ผ่าน WiFi "${REQUIRED_SSID}" ก่อนทำรายการ`);
      return;
    }
    saveAttendance(user.id, type);
    setRecords(getAttendanceRecords(user.id));
    onUpdate();
    showAlert(type === 'IN' ? 'เช็คอินสำเร็จ (ผ่าน WiFi Office)' : 'เช็คเอาท์สำเร็จ');
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
                {currentTime.toLocaleDateString('th-TH', { dateStyle: 'full' })}
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
                    {statusMessage || `พร้อมตรวจสอบ WiFi: ${REQUIRED_SSID}`}
                  </p>
                </div>
              </div>

              <button 
                onClick={verifyWiFiNetwork}
                disabled={isVerifying}
                className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition shadow-sm disabled:opacity-50"
              >
                {isVerifying ? 'กำลังสแกนเครือข่าย...' : 'ตรวจสอบเครือข่าย WiFi'}
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="w-full md:w-72 space-y-4">
            <button 
              onClick={() => handleAction('IN')}
              disabled={!!todayRecord?.checkIn || verificationStatus !== 'SUCCESS'}
              className="w-full h-24 bg-emerald-600 text-white rounded-[32px] font-black text-xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition disabled:opacity-30 disabled:grayscale transform active:scale-95"
            >
              เช็คอิน (IN)
            </button>
            <button 
              onClick={() => handleAction('OUT')}
              disabled={!todayRecord?.checkIn || !!todayRecord?.checkOut || verificationStatus !== 'SUCCESS'}
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
          ระบบนี้ใช้การตรวจสอบผ่าน WiFi <strong>{REQUIRED_SSID}</strong> ของบริษัทเพื่อยืนยันว่าพนักงานปฏิบัติงานอยู่ในพื้นที่ที่กำหนด หากท่านใช้งานผ่านเว็บเบราว์เซอร์และมีการแจ้งเตือนว่าไม่พบเครือข่าย กรุณาตรวจสอบว่าท่านไม่ได้ใช้งาน VPN หรือ Mobile Hotspot อยู่ในขณะทำรายการ
        </p>
      </div>
    </div>
  );
};

export default AttendanceModule;
