import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, Gender, LeaveTypeDefinition, LeaveStatus } from '../types';
import { AttendanceLatePolicy, getAllUsers, updateUser, addUser, deleteUser, getHolidays, saveHoliday, deleteHoliday, resetAllData, getLeaveTypes, saveLeaveTypes, addLeaveType, updateLeaveType, deleteLeaveType, getLeaveRequests, getAttendanceLatePolicy, saveAttendanceLatePolicy } from '../store';
import { useAlert } from '../AlertContext';
import DatePicker from './DatePicker';

function businessDays(startStr: string, endStr: string, holidays: Record<string, string>): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start.getTime());
  while (cur <= end) {
    const d = cur.getDay();
    const iso = cur.toISOString().split('T')[0];
    if (d !== 0 && d !== 6 && !holidays[iso]) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.EMPLOYEE]: 'พนักงาน',
  [UserRole.MANAGER]: 'ผู้จัดการ',
  [UserRole.ADMIN]: 'ผู้ดูแลระบบ',
};

const GENDER_LABELS: Record<Gender, string> = { male: 'ชาย', female: 'หญิง' };
const APPLICABLE_LABELS: Record<'male' | 'female' | 'both', string> = { male: 'ชายเท่านั้น', female: 'หญิงเท่านั้น', both: 'ทั้งชายและหญิง' };

interface AdminPanelProps {
  onUserDeleted?: (userId: string) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onUserDeleted }) => {
  const { showAlert, showConfirm } = useAlert();
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'leavetypes' | 'holidays'>('employees');
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.EMPLOYEE);
  const [newGender, setNewGender] = useState<Gender>('male');
  const [newDepartment, setNewDepartment] = useState('');
  const [newJoinDate, setNewJoinDate] = useState('');
  const [newManagerId, setNewManagerId] = useState('');

  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDefinition[]>([]);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveTypeDefinition | null>(null);
  const [showAddLeaveType, setShowAddLeaveType] = useState(false);
  const [newLTLabel, setNewLTLabel] = useState('');
  const [newLTApplicable, setNewLTApplicable] = useState<'male' | 'female' | 'both'>('both');
  const [newLTQuota, setNewLTQuota] = useState('0');

  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [latePolicy, setLatePolicy] = useState<AttendanceLatePolicy>(getAttendanceLatePolicy());

  const refreshUsers = () => setUsers(getAllUsers());

  useEffect(() => {
    refreshUsers();
    setHolidays(getHolidays());
    setLeaveTypes(getLeaveTypes());
    setLatePolicy(getAttendanceLatePolicy());
  }, []);

  const handleSaveLatePolicy = () => {
    const normalized: AttendanceLatePolicy = {
      tiers: latePolicy.tiers
        .map(t => ({
          after: (t.after || '').trim(),
          penalty: Math.max(0, Number(t.penalty) || 0),
        }))
        .filter(t => !!t.after),
    };
    if (normalized.tiers.length === 0) {
      showAlert('ต้องมีกติกาอย่างน้อย 1 ช่วงเวลา');
      return;
    }
    saveAttendanceLatePolicy(normalized);
    setLatePolicy(getAttendanceLatePolicy());
    showAlert('บันทึกกติกาหักลาพักร้อนกรณีมาสายเรียบร้อยแล้ว');
  };

  const handleAddLateTier = () => {
    setLatePolicy(prev => ({
      ...prev,
      tiers: [...prev.tiers, { after: '10:30:00', penalty: 0.75 }],
    }));
  };

  const handleRemoveLateTier = (idx: number) => {
    setLatePolicy(prev => {
      if (prev.tiers.length <= 1) return prev;
      return { ...prev, tiers: prev.tiers.filter((_, i) => i !== idx) };
    });
  };

  const handleLateTierChange = (idx: number, patch: { after?: string; penalty?: number }) => {
    setLatePolicy(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === idx ? { ...t, ...patch } : t),
    }));
  };

  const handleEdit = (user: User) => {
    setEditingUser({ ...user, quotas: { ...user.quotas } });
    setEditPassword('');
  };

  const handleSave = () => {
    if (!editingUser) return;
    const toSave: User = {
      ...editingUser,
      name: editingUser.name.trim(),
      email: editingUser.email.trim(),
      department: editingUser.department.trim(),
      password: editPassword.trim() || editingUser.password,
    };
    const result = updateUser(toSave);
    const onDone = () => {
      refreshUsers();
      setEditingUser(null);
      setEditPassword('');
      showAlert('บันทึกข้อมูลพนักงานเรียบร้อยแล้ว');
    };
    if (result != null && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).then(onDone).catch(() => showAlert('ไม่สามารถอัปเดตข้อมูลได้ กรุณาลองใหม่'));
    } else {
      onDone();
    }
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const email = newEmail.trim();
    const password = newPassword.trim();
    const department = newDepartment.trim();
    if (!name || !email || !password || !department || !newJoinDate) {
      showAlert('กรุณากรอกชื่อ อีเมล รหัสผ่าน แผนก และวันเริ่มงาน');
      return;
    }
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      showAlert('อีเมลนี้มีในระบบแล้ว');
      return;
    }
    addUser({
      name,
      email,
      password,
      role: newRole,
      gender: newGender,
      department,
      joinDate: newJoinDate,
      managerId: newManagerId || undefined,
      quotas: {},
    });
    refreshUsers();
    setShowAddModal(false);
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewRole(UserRole.EMPLOYEE);
    setNewGender('male');
    setNewDepartment('');
    setNewJoinDate('');
    setNewManagerId('');
    showAlert('เพิ่มพนักงานใหม่เรียบร้อยแล้ว');
  };

  const refreshLeaveTypes = () => setLeaveTypes(getLeaveTypes());

  const handleSaveLeaveType = () => {
    if (!editingLeaveType) return;
    const result = updateLeaveType(editingLeaveType.id, {
      label: editingLeaveType.label.trim(),
      applicableTo: editingLeaveType.applicableTo,
      defaultQuota: Math.max(0, Math.floor(Number(editingLeaveType.defaultQuota)) || 0),
    });
    const onDone = () => {
      refreshLeaveTypes();
      setEditingLeaveType(null);
      showAlert('บันทึกประเภทวันลาเรียบร้อยแล้ว');
    };
    if (result != null && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).then(onDone).catch(() => showAlert('ไม่สามารถบันทึกได้ กรุณาลองใหม่'));
    } else {
      onDone();
    }
  };

  const handleAddLeaveType = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLTLabel.trim();
    if (!label) return;
    const quota = Math.max(0, Math.floor(Number(newLTQuota)) || 0);
    const result = addLeaveType({ label, applicableTo: newLTApplicable, defaultQuota: quota, isActive: true });
    const onDone = () => {
      refreshLeaveTypes();
      setShowAddLeaveType(false);
      setNewLTLabel('');
      setNewLTApplicable('both');
      setNewLTQuota('0');
      showAlert('เพิ่มประเภทวันลาเรียบร้อยแล้ว');
    };
    if (result != null && typeof (result as Promise<LeaveTypeDefinition>).then === 'function') {
      (result as Promise<LeaveTypeDefinition>).then(onDone).catch(() => showAlert('ไม่สามารถเพิ่มได้ กรุณาลองใหม่'));
    } else {
      onDone();
    }
  };

  const handleDeleteLeaveType = (lt: LeaveTypeDefinition) => {
    if (!window.confirm(`ปิดใช้ประเภท "${lt.label}" หรือไม่?\n(พนักงานจะไม่เห็นตัวเลือกนี้)`)) return;
    const result = deleteLeaveType(lt.id);
    if (result != null && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).then(() => refreshLeaveTypes()).catch(() => {});
    } else {
      refreshLeaveTypes();
    }
  };

  const handleDeleteEmployee = (user: User) => {
    if (users.length <= 1) {
      showAlert('ไม่สามารถลบได้ ระบบต้องมีพนักงานอย่างน้อย 1 คน');
      return;
    }
    showConfirm(
      `ต้องการลบพนักงาน "${user.name}" ออกจากระบบหรือไม่?\n(ใช้เมื่อพนักงานลาออก)`,
      () => {
        const ok = deleteUser(user.id);
        if (ok) {
          refreshUsers();
          onUserDeleted?.(user.id);
          showAlert('ลบข้อมูลพนักงานเรียบร้อยแล้ว');
        }
      }
    );
  };

  const handleResetAllData = () => {
    if (!window.confirm('ต้องการลบข้อมูลเดิมทั้งหมดและโหลดข้อมูลตั้งต้น (รายชื่อ 20 คน) ใหม่หรือไม่?\n\nคุณจะถูกออกจากระบบและต้องเข้าสู่ระบบใหม่')) return;
    resetAllData();
    window.location.reload();
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return;
    console.log('🔵 [AdminPanel] กำลังเพิ่มวันหยุด:', { date: newHolidayDate, name: newHolidayName });
    const result = saveHoliday(newHolidayDate, newHolidayName);
    const promise = result && typeof (result as Promise<void>).then === 'function' ? (result as Promise<void>) : null;
    if (promise) {
      console.log('🟢 [AdminPanel] ใช้โหมด API (Promise)');
      promise
        .then(() => {
          console.log('✅ [AdminPanel] API สำเร็จ, รีเฟรช holidays');
          setHolidays(getHolidays());
        })
        .catch((err) => {
          console.error('❌ [AdminPanel] API ล้มเหลว:', err);
        });
    } else {
      console.log('🟡 [AdminPanel] ใช้โหมด localStorage');
      setHolidays(getHolidays());
    }
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const handleDeleteHoliday = (date: string) => {
    if (window.confirm(`ต้องการลบวันหยุดวันที่ ${date} หรือไม่?`)) {
      const result = deleteHoliday(date);
      const promise = result && typeof (result as Promise<void>).then === 'function' ? (result as Promise<void>) : null;
      if (promise) promise.then(() => setHolidays(getHolidays()));
      else setHolidays(getHolidays());
    }
  };

  const sortedHolidayDates = Object.keys(holidays).sort();

  return (
    <div className="space-y-6">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
        <button 
          onClick={() => setActiveSubTab('employees')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition ${activeSubTab === 'employees' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          รายชื่อพนักงาน
        </button>
        <button 
          onClick={() => { setActiveSubTab('leavetypes'); refreshLeaveTypes(); }}
          className={`px-4 py-2 rounded-lg text-xs font-black transition ${activeSubTab === 'leavetypes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ประเภทวันลา
        </button>
        <button 
          onClick={() => setActiveSubTab('holidays')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition ${activeSubTab === 'holidays' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          จัดการวันหยุดบริษัท
        </button>
      </div>

      {activeSubTab === 'employees' ? (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              รายชื่อและสิทธิพนักงาน
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 transition shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                เพิ่มพนักงาน
              </button>
              <button
                type="button"
                onClick={handleResetAllData}
                className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-2xl font-black text-sm hover:bg-amber-600 transition shadow-lg"
                title="ลบข้อมูลเดิมทั้งหมด แล้วโหลดรายชื่อ 20 คน + วันหยุดตั้งต้นใหม่"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                โหลดข้อมูลตั้งต้นใหม่
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">พนักงาน</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">แผนก</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">บทบาท</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">ผู้บังคับบัญชา</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-center">ลาพักร้อน</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(() => {
                  const requests = getLeaveRequests();
                  const currentYear = new Date().getFullYear();
                  const holidayMap = getHolidays();
                  const vacationUsedByUser: Record<string, number> = {};
                  users.forEach(u => { vacationUsedByUser[u.id] = 0; });
                  requests.forEach(req => {
                    if (req.type !== 'VACATION' || req.status === LeaveStatus.REJECTED) return;
                    const start = new Date(req.startDate);
                    if (start.getFullYear() !== currentYear) return;
                    vacationUsedByUser[req.userId] = (vacationUsedByUser[req.userId] ?? 0) + businessDays(req.startDate, req.endDate, holidayMap);
                  });
                  const defaultVacation = getLeaveTypes().find(t => t.id === 'VACATION')?.defaultQuota ?? 0;
                  return users.map(user => {
                    const manager = users.find(u => u.id === user.managerId);
                    const joinDate = new Date(user.joinDate);
                    const tenureYears = (Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                    const effectiveQuota = tenureYears < 1 ? 0 : (user.quotas['VACATION'] ?? defaultVacation);
                    const used = vacationUsedByUser[user.id] ?? 0;
                    const remaining = effectiveQuota - used;
                    return (
                    <tr key={user.id} className="hover:bg-gray-50 transition group">
                      <td className="px-6 py-4">
                        <div className="font-black text-gray-900">{user.name}</div>
                        <div className="text-[10px] text-gray-400 font-bold">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold text-gray-600 uppercase">{user.department}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          user.role === UserRole.ADMIN ? 'bg-indigo-100 text-indigo-700' :
                          user.role === UserRole.MANAGER ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {ROLE_LABELS[user.role]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {manager ? (
                          <span className="bg-blue-50 px-2 py-1 rounded text-[10px] font-bold text-blue-700">
                            {manager.name}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-bold">
                            ยังไม่ได้กำหนด
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center font-black text-blue-600">
                        {remaining < 0 ? (
                          <span className="text-red-600 font-bold" title="ใช้เกินโควต้า">ติดลบ {(-remaining).toFixed(2)} วัน</span>
                        ) : (
                          <>{remaining.toFixed(2)} วันคงเหลือ</>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(user)}
                            className="text-xs font-black text-blue-600 hover:text-blue-800 uppercase tracking-tighter"
                          >
                            แก้ไข
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(user)}
                            disabled={users.length <= 1}
                            className="text-xs font-black text-rose-600 hover:text-rose-800 uppercase tracking-tighter disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeSubTab === 'leavetypes' ? (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              จัดการประเภทวันลา
            </h2>
            <button type="button" onClick={() => setShowAddLeaveType(true)} className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              เพิ่มประเภทวันลา
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">กำหนดชื่อประเภท ใช้กับเพศใด และโควต้าวันต่อปี — พนักงานชายจะไม่เห็นประเภทที่ตั้งเป็นหญิงเท่านั้น (เช่น ลาคลอด)</p>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4">
            <h4 className="text-sm font-black text-indigo-900 mb-3">กติกาหักลาพักร้อนกรณีเข้างานสาย</h4>
            <div className="space-y-2">
              {latePolicy.tiers.map((tier, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-indigo-500 uppercase mb-1 tracking-widest">
                      ช่วงที่ {idx + 1}: เริ่มหักหลังเวลา
                    </label>
                    <input
                      type="time"
                      step={1}
                      value={tier.after}
                      onChange={(e) => handleLateTierChange(idx, { after: e.target.value || '09:30:00' })}
                      className="w-full p-3 border-2 border-indigo-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-indigo-500 uppercase mb-1 tracking-widest">
                      จำนวนวันที่หัก
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.25"
                      value={tier.penalty}
                      onChange={(e) => handleLateTierChange(idx, { penalty: Number(e.target.value) })}
                      className="w-full p-3 border-2 border-indigo-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLateTier(idx)}
                    disabled={latePolicy.tiers.length <= 1}
                    className="h-[46px] px-3 bg-rose-100 text-rose-700 rounded-xl text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ลบช่วง
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 gap-2">
              <p className="text-[11px] text-indigo-700 font-medium">
                รองรับหลายช่วงเวลา: ระบบจะใช้อัตราหักของช่วงที่ตรงกับเวลาเช็คอินล่าสุดโดยอัตโนมัติ
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddLateTier}
                  className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-xl text-xs font-black hover:bg-indigo-100 transition"
                >
                  เพิ่มช่วง
                </button>
                <button
                  type="button"
                  onClick={handleSaveLatePolicy}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 transition"
                >
                  บันทึกกติกา
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">ชื่อประเภท</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">ใช้กับ</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-center">โควต้า (วัน/ปี)</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaveTypes.filter(t => t.isActive).sort((a, b) => a.order - b.order).map(lt => (
                  <tr key={lt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-bold text-gray-900">{lt.label}</td>
                    <td className="px-6 py-4"><span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold text-gray-600">{APPLICABLE_LABELS[lt.applicableTo]}</span></td>
                    <td className="px-6 py-4 text-center font-black text-indigo-600">{lt.defaultQuota >= 999 ? 'ไม่จำกัด' : lt.defaultQuota}</td>
                    <td className="px-6 py-4 text-right">
                      <button type="button" onClick={() => setEditingLeaveType({ ...lt })} className="text-xs font-black text-blue-600 hover:text-blue-800 mr-2">แก้ไข</button>
                      <button type="button" onClick={() => handleDeleteLeaveType(lt)} className="text-xs font-black text-rose-600 hover:text-rose-800">ปิดใช้</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAddLeaveType && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
                <h3 className="text-lg font-black text-gray-900 mb-4">เพิ่มประเภทวันลา</h3>
                <form onSubmit={handleAddLeaveType} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">ชื่อประเภท</label>
                    <input type="text" required value={newLTLabel} onChange={(e) => setNewLTLabel(e.target.value)} placeholder="เช่น ลาคลอด" className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">ใช้กับเพศ</label>
                    <select value={newLTApplicable} onChange={(e) => setNewLTApplicable(e.target.value as 'male'|'female'|'both')} className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold">
                      {Object.entries(APPLICABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">โควต้าวันต่อปี (999 = ไม่จำกัด)</label>
                    <input type="number" min={0} value={newLTQuota} onChange={(e) => setNewLTQuota(e.target.value)} className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm">บันทึก</button>
                    <button type="button" onClick={() => setShowAddLeaveType(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-black text-sm">ยกเลิก</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {editingLeaveType && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
                <h3 className="text-lg font-black text-gray-900 mb-4">แก้ไขประเภทวันลา</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">ชื่อประเภท</label>
                    <input type="text" value={editingLeaveType.label} onChange={(e) => setEditingLeaveType(prev => prev ? { ...prev, label: e.target.value } : prev)} className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">ใช้กับเพศ</label>
                    <select value={editingLeaveType.applicableTo} onChange={(e) => setEditingLeaveType(prev => prev ? { ...prev, applicableTo: e.target.value as 'male'|'female'|'both' } : prev)} className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold">
                      {Object.entries(APPLICABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">โควต้าวันต่อปี (999 = ไม่จำกัด)</label>
                    <input type="number" min={0} value={editingLeaveType.defaultQuota} onChange={(e) => setEditingLeaveType(prev => prev ? { ...prev, defaultQuota: Math.max(0, Math.floor(Number(e.target.value)) || 0) } : prev)} className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSaveLeaveType} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm">บันทึก</button>
                    <button type="button" onClick={() => setEditingLeaveType(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-black text-sm">ยกเลิก</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <form onSubmit={handleAddHoliday} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
              <h3 className="font-black text-gray-900 mb-6 flex items-center gap-2">
                <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                เพิ่มวันหยุด
              </h3>
              <div className="space-y-6">
                <DatePicker 
                  label="วันที่"
                  value={newHolidayDate}
                  onChange={setNewHolidayDate}
                  placeholder="เลือกวันหยุด"
                />
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">ชื่อวันหยุด</label>
                  <input 
                    type="text" 
                    required
                    maxLength={200}
                    placeholder="เช่น วันสงกรานต์"
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    className="w-full p-4 bg-white border-2 border-gray-200 rounded-2xl outline-none focus:border-blue-500 font-bold text-sm transition"
                  />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition shadow-xl shadow-blue-50">
                  บันทึกวันหยุด
                </button>
              </div>
            </form>
          </div>
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left font-black text-gray-400 uppercase text-[10px] tracking-widest">วันที่</th>
                    <th className="px-6 py-4 text-left font-black text-gray-400 uppercase text-[10px] tracking-widest">วันหยุด</th>
                    <th className="px-6 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedHolidayDates.map(date => (
                    <tr key={date} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-bold text-gray-700">
                        {new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">{holidays[date]}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleDeleteHoliday(date)} className="text-rose-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sortedHolidayDates.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-gray-400 font-bold italic">ไม่พบข้อมูลวันหยุด</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
              </div>
              เพิ่มพนักงานใหม่
            </h3>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">ชื่อ-นามสกุล</label>
                <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="นาย/นาง/นางสาว ..." className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">อีเมล</label>
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@company.com" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">รหัสผ่าน (ใช้เข้าสู่ระบบ)</label>
                <input type="text" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="รหัสผ่านเริ่มต้น" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
                <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">บทบาท</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold">
                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">เพศ</label>
                  <select value={newGender} onChange={(e) => setNewGender(e.target.value as Gender)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold">
                    {Object.entries(GENDER_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">แผนก</label>
                <input type="text" required value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="เช่น Finance" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">วันเริ่มงาน</label>
                <DatePicker value={newJoinDate} onChange={setNewJoinDate} label="" placeholder="เลือกวันที่" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">ผู้บังคับบัญชา</label>
                <select value={newManagerId} onChange={(e) => setNewManagerId(e.target.value)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold">
                  <option value="">— ยังไม่ได้กำหนด —</option>
                  {users.filter(u => u.role === UserRole.MANAGER || u.role === UserRole.ADMIN).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black text-sm hover:bg-emerald-700 transition">
                  บันทึก
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-2xl font-black text-sm hover:bg-gray-200 transition">
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
              แก้ไขข้อมูล: {editingUser.name}
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">ชื่อ-นามสกุล</label>
                <input type="text" value={editingUser.name} onChange={(e) => setEditingUser(prev => prev ? { ...prev, name: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">อีเมล</label>
                <input type="email" value={editingUser.email} onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">เปลี่ยนรหัสผ่าน (เว้นว่างถ้าไม่เปลี่ยน)</label>
                <input type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="รหัสผ่านใหม่" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">บทบาท</label>
                  <select value={editingUser.role} onChange={(e) => setEditingUser(prev => prev ? { ...prev, role: e.target.value as UserRole } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold">
                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">เพศ</label>
                  <select value={editingUser.gender} onChange={(e) => setEditingUser(prev => prev ? { ...prev, gender: e.target.value as Gender } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold">
                    {Object.entries(GENDER_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">แผนก</label>
                <input type="text" value={editingUser.department} onChange={(e) => setEditingUser(prev => prev ? { ...prev, department: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">วันเริ่มงาน</label>
                <DatePicker value={editingUser.joinDate} onChange={(v) => setEditingUser(prev => prev ? { ...prev, joinDate: v } : prev)} label="" placeholder="เลือกวันที่" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">ผู้บังคับบัญชา</label>
                <select value={editingUser.managerId || ''} onChange={(e) => setEditingUser(prev => prev ? { ...prev, managerId: e.target.value || undefined } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold">
                  <option value="">— ยังไม่ได้กำหนด —</option>
                  {users.filter(u => u.id !== editingUser.id && (u.role === UserRole.MANAGER || u.role === UserRole.ADMIN)).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={handleSave} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 transition shadow-xl shadow-blue-50">
                บันทึกการเปลี่ยนแปลง
              </button>
              <button type="button" onClick={() => { setEditingUser(null); setEditPassword(''); }} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black hover:bg-gray-200 transition">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
