import React, { useState, useCallback } from 'react';
import { User } from '../types';
import { getAllUsers, saveCurrentUser, loadFromApi } from '../store';
import { isApiMode, login as apiLogin, setToken } from '../api';

/** OWASP: Rate limit - max attempts before lockout (client-side; production should enforce server-side). */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

interface LoginProps {
  onLogin: (user: User) => void;
}

/** แปลง quota keys จาก lowercase (backend) เป็น UPPERCASE (ที่ frontend ใช้) */
function normalizeQuotaKeys(raw: Record<string, unknown>): Record<string, number> {
  const KEY_MAP: Record<string, string> = {
    sick: 'SICK', vacation: 'VACATION', personal: 'PERSONAL',
    maternity: 'MATERNITY', sterilization: 'STERILIZATION', other: 'OTHER',
    ordination: 'ORDINATION', military: 'MILITARY', paternity: 'PATERNITY',
  };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = KEY_MAP[k.toLowerCase()] ?? k.toUpperCase();
    out[mapped] = Number(v) || 0;
  }
  return out;
}

function normalizeUserId(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    return String(parseInt(s, 10)).padStart(3, '0');
  }
  return s;
}

function normalizeUser(u: Record<string, unknown>): User {
  const rawQuotas = (u.quotas && typeof u.quotas === 'object') ? (u.quotas as Record<string, unknown>) : {};
  return {
    id: normalizeUserId(u.id ?? ''),
    name: String(u.name ?? ''),
    email: String(u.email ?? ''),
    password: '',
    role: (u.role as User['role']) ?? 'EMPLOYEE',
    gender: ((u.gender as User['gender']) ?? 'male'),
    department: String(u.department ?? ''),
    joinDate: String(u.joinDate ?? u.join_date ?? ''),
    managerId: u.managerId != null ? normalizeUserId(u.managerId) : (u.manager_id != null ? normalizeUserId(u.manager_id) : undefined),
    quotas: normalizeQuotaKeys(rawQuotas),
  };
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isError, setIsError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);

  const users = getAllUsers();

  const handleLoginSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) return;

    if (isApiMode()) {
      apiLogin(email.trim(), password).then(({ user, token }) => {
        setAttempts(0);
        setToken(token);
        const normalized = normalizeUser(user as Record<string, unknown>);
        saveCurrentUser(normalized);
        loadFromApi().then(() => onLogin(normalized));
      }).catch(() => {
        const next = attempts + 1;
        setAttempts(next);
        setIsError(true);
        setTimeout(() => setIsError(false), 3000);
        if (next >= MAX_ATTEMPTS) setLockedUntil(Date.now() + LOCKOUT_MS);
      });
      return;
    }

    const foundUser = users.find(u => u.email === email.trim() && u.password === password);
    if (foundUser) {
      setAttempts(0);
      saveCurrentUser(foundUser);
      onLogin(foundUser);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setIsError(true);
      setTimeout(() => setIsError(false), 3000);
      if (next >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setTimeout(() => setAttempts(0), LOCKOUT_MS);
      }
    }
  }, [email, password, attempts, lockedUntil, users, onLogin]);

  const handleDemoClick = (user: User) => {
    setEmail(user.email);
    setPassword(user.password);
  };

  const isLocked = Date.now() < lockedUntil;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <div className="inline-flex flex-col items-center gap-2 mb-4">
            <img src="/connex-logo.png" alt="CONNEX" className="h-16 w-auto object-contain" />
            <span className="text-lg font-bold text-gray-900 tracking-tight">Leave Flow Pro</span>
          </div>
          <p className="text-gray-600">ลงชื่อเข้าใช้งานเพื่อเริ่มทำรายการ</p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@b-connex.net"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="รหัสผ่าน (ID พนักงาน)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
                required
              />
            </div>

            {isError && (
              <p className="text-red-500 text-xs text-center font-semibold">อีเมลหรือรหัสผ่านไม่ถูกต้อง</p>
            )}

            <button 
              type="submit"
              disabled={isLocked}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition transform hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-blue-200 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLocked ? 'กรุณารอสักครู่...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="mt-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-white text-gray-400 font-bold uppercase tracking-wider">Demo Access</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
              {users.slice(0, 5).map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleDemoClick(user)}
                  disabled={isLocked}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-left group disabled:opacity-50"
                >
                  <div className="flex flex-col">
                    <p className="text-xs font-bold text-gray-800 group-hover:text-blue-700">{user.name}</p>
                    <p className="text-[10px] text-gray-500">{user.role}</p>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">คลิกเพื่อใช้บัญชี</span>
                </button>
              ))}
              <p className="text-[10px] text-center text-gray-400 italic">
                {isLocked ? `ลองใหม่อีกครั้งหลัง ${Math.ceil((lockedUntil - Date.now()) / 1000)} วินาที` : 'เลือกบัญชีตัวอย่างเพื่อทดสอบระบบ'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
