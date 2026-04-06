import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, Gender, LeaveTypeDefinition, LeaveStatus, TimesheetProject, TimesheetTaskTypeDefinition, ExpenseTypeDefinition } from '../types';
import { AttendanceLatePolicy, calculateLatePenaltyDays, getAllUsers, getAttendanceRecords, loadAttendanceForUser, loadFromApi, updateUser, addUser, deleteUser, getHolidays, saveHoliday, deleteHoliday, getLeaveTypes, saveLeaveTypes, addLeaveType, updateLeaveType, setLeaveTypeActive, getLeaveRequests, getAttendanceLatePolicy, saveAttendanceLatePolicy, getTimesheetProjects, upsertTimesheetProject, getTimesheetTaskTypes, saveTimesheetTaskTypes } from '../store';
import { useAlert } from '../AlertContext';
import DatePicker from './DatePicker';
import { formatYmdAsDdMmBe } from '../utils';
import { deleteExpenseType, getExpenseTypes, getHolidays as getHolidaysFromApi, isApiMode, postExpenseType, postRecalculateVacationQuotaCurrent } from '../api';
import { useAsyncAction } from '../hooks/useAsyncAction';
import TablePagination, { useTablePagination } from './TablePagination';
import { FIELD_MAX_LENGTHS } from '../constants';

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

function formatUpdatedAt(raw?: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const day = pick('day');
  const month = pick('month');
  const year = pick('year');
  const hour = pick('hour');
  const minute = pick('minute');
  if (!day || !month || !year || !hour || !minute) return '-';
  return `${day}/${month}/${year}, ${hour}:${minute}`;
}

function formatUpdatedByWithTime(updatedByName?: string, updatedAt?: string): string {
  const name = String(updatedByName ?? '').trim();
  const when = formatUpdatedAt(updatedAt);
  if (name && when !== '-') return `${name} - ${when}`;
  if (name) return name;
  if (when !== '-') return when;
  return '-';
}

interface AdminPanelProps {
  currentUser: User;
  onUserDeleted?: (userId: string) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onUserDeleted }) => {
  const { showAlert, showConfirm } = useAlert();
  const { runAction, isActionBusy } = useAsyncAction();
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'leavetypes' | 'holidays' | 'projects' | 'vacationpolicy' | 'expensetypes'>('projects');
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.EMPLOYEE);
  const [newGender, setNewGender] = useState<Gender>('male');
  const [newPosition, setNewPosition] = useState('');
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
  const [holidayUpdatedBy, setHolidayUpdatedBy] = useState<Record<string, string>>({});
  const [holidayUpdatedAt, setHolidayUpdatedAt] = useState<Record<string, string>>({});
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [latePolicy, setLatePolicy] = useState<AttendanceLatePolicy>(getAttendanceLatePolicy());
  const [timesheetProjects, setTimesheetProjects] = useState<TimesheetProject[]>([]);
  const [editProject, setEditProject] = useState<TimesheetProject | null>(null);
  const [projCode, setProjCode] = useState('');
  const [projName, setProjName] = useState('');
  const [projManagerId, setProjManagerId] = useState('');
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [taskTargets, setTaskTargets] = useState<Record<string, number>>({});
  const [taskTypes, setTaskTypes] = useState<TimesheetTaskTypeDefinition[]>([]);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [projectTab, setProjectTab] = useState<'project' | 'task'>('project');
  const [expenseTypes, setExpenseTypes] = useState<ExpenseTypeDefinition[]>([]);
  const [newExpenseLabel, setNewExpenseLabel] = useState('');
  const isAdmin = currentUser.role === UserRole.ADMIN;

  const resetAddEmployeeForm = () => {
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewRole(UserRole.EMPLOYEE);
    setNewGender('male');
    setNewPosition('');
    setNewDepartment('');
    setNewJoinDate('');
    setNewManagerId('');
  };

  const openAddEmployeeModal = () => {
    resetAddEmployeeForm();
    setShowAddModal(true);
  };

  const closeAddEmployeeModal = () => {
    setShowAddModal(false);
    resetAddEmployeeForm();
  };

  const resetAddLeaveTypeForm = () => {
    setNewLTLabel('');
    setNewLTApplicable('both');
    setNewLTQuota('0');
  };

  const openAddLeaveTypeModal = () => {
    resetAddLeaveTypeForm();
    setShowAddLeaveType(true);
  };

  const closeAddLeaveTypeModal = () => {
    setShowAddLeaveType(false);
    resetAddLeaveTypeForm();
  };

  const refreshUsers = () => setUsers(getAllUsers());

  useEffect(() => {
    refreshUsers();
    setHolidays(getHolidays());
    setLeaveTypes(getLeaveTypes());
    setLatePolicy(getAttendanceLatePolicy());
    setTimesheetProjects(getTimesheetProjects());
    setTaskTypes(getTimesheetTaskTypes());
    getExpenseTypes().then((rows) => {
      setExpenseTypes(rows.map((x) => ({
        id: String(x.id ?? ''),
        label: String(x.label ?? ''),
        isActive: x.isActive !== false,
        updatedAt: String(x.updatedAt ?? x.updated_at ?? ''),
        updatedById: String(x.updatedById ?? x.updated_by ?? ''),
        updatedByName: String(x.updatedByName ?? x.updated_by_name ?? ''),
      })));
    }).catch(() => {});
    if (isApiMode()) {
      getHolidaysFromApi().then((rows) => {
        if (!Array.isArray(rows)) return;
        const auditBy: Record<string, string> = {};
        const auditAt: Record<string, string> = {};
        for (const item of rows) {
          if (!item || typeof item !== 'object') continue;
          const o = item as Record<string, unknown>;
          const date = String(o.date ?? '').slice(0, 10);
          if (!date) continue;
          auditBy[date] = String(o.updatedByName ?? o.updated_by_name ?? '');
          auditAt[date] = String(o.updatedAt ?? o.updated_at ?? '');
        }
        setHolidayUpdatedBy(auditBy);
        setHolidayUpdatedAt(auditAt);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isAdmin && ['employees', 'leavetypes', 'holidays', 'vacationpolicy'].includes(activeSubTab)) {
      setActiveSubTab('projects');
    }
  }, [activeSubTab, isAdmin]);

  const refreshTimesheetProjects = () => setTimesheetProjects(getTimesheetProjects());
  const refreshTaskTypes = () => setTaskTypes(getTimesheetTaskTypes());
  const refreshExpenseTypes = () => {
    return getExpenseTypes().then((rows) => {
      setExpenseTypes(rows.map((x) => ({
        id: String(x.id ?? ''),
        label: String(x.label ?? ''),
        isActive: x.isActive !== false,
        updatedAt: String(x.updatedAt ?? x.updated_at ?? ''),
        updatedById: String(x.updatedById ?? x.updated_by ?? ''),
        updatedByName: String(x.updatedByName ?? x.updated_by_name ?? ''),
      })));
    }).catch(() => showAlert('ไม่สามารถโหลดประเภทค่าใช้จ่ายได้'));
  };
  const refreshHolidaysAudit = () => {
    if (!isApiMode()) return Promise.resolve();
    return getHolidaysFromApi().then((rows) => {
      if (!Array.isArray(rows)) return;
      const auditBy: Record<string, string> = {};
      const auditAt: Record<string, string> = {};
      for (const item of rows) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const date = String(o.date ?? '').slice(0, 10);
        if (!date) continue;
        auditBy[date] = String(o.updatedByName ?? o.updated_by_name ?? '');
        auditAt[date] = String(o.updatedAt ?? o.updated_at ?? '');
      }
      setHolidayUpdatedBy(auditBy);
      setHolidayUpdatedAt(auditAt);
    }).catch(() => {});
  };
  const usersByDepartment = useMemo(() => {
    const map = new Map<string, User[]>();
    for (const u of users) {
      const dept = (u.department || 'ไม่ระบุแผนก').trim() || 'ไม่ระบุแผนก';
      const list = map.get(dept) ?? [];
      list.push(u);
      map.set(dept, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'th'));
  }, [users]);

  const handleSaveLatePolicy = () => {
    runAction('admin-save-late-policy', async () => {
      const normalized: AttendanceLatePolicy = {
        tiers: latePolicy.tiers
          .map(t => ({
            after: (t.after || '').trim(),
            penalty: Math.min(12, Math.max(0, Number(t.penalty) || 0)),
          }))
          .filter(t => !!t.after),
      };
      if (normalized.tiers.length === 0) {
        showAlert('ต้องมีกติกาอย่างน้อย 1 ช่วงเวลา');
        return;
      }
      await Promise.resolve(saveAttendanceLatePolicy(normalized));
      setLatePolicy(getAttendanceLatePolicy());
      showAlert('บันทึกกติกาหักลาพักร้อนกรณีมาสายเรียบร้อยแล้ว');
    });
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
    const normalizePenalty = (v: number | undefined, fallback: number): number => {
      if (typeof v !== 'number' || Number.isNaN(v) || v < 0) return fallback;
      return Math.min(12, v);
    };
    setLatePolicy(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === idx
        ? {
            ...t,
            ...patch,
            penalty: normalizePenalty(patch.penalty, t.penalty),
          }
        : t),
    }));
  };

  const handleEdit = (user: User) => {
    setEditingUser({ ...user, quotas: { ...user.quotas } });
    setEditPassword('');
  };

  const normalizeJoinDateForCalc = (joinDateRaw: string): string | null => {
    const raw = String(joinDateRaw || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoPrefix) {
      const yy = Number(isoPrefix[1]);
      const mm = Number(isoPrefix[2]);
      const dd = Number(isoPrefix[3]);
      if (yy >= 1900 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
    }
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      const dd = Number(slash[1]);
      const mm = Number(slash[2]);
      let yy = Number(slash[3]);
      if (yy >= 2400) yy -= 543;
      if (yy < 1900 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    return null;
  };

  const getBangkokTodayParts = (): { year: number; month: number; day: number } => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value ?? '0');
    return { year: get('year'), month: get('month'), day: get('day') };
  };

  const computeVacationEntitlementByRules = (
    user: User
  ): { fullYearEntitlement: number; earnedEntitlement: number; processYear: number } => {
    const { year: processYear } = getBangkokTodayParts();
    const jan1Time = Date.UTC(processYear, 0, 1, 0, 0, 0);
    const yearEndTime = Date.UTC(processYear, 11, 31, 0, 0, 0);
    const normalizedJoinDate = normalizeJoinDateForCalc(user.joinDate);

    if (!normalizedJoinDate) {
      return { fullYearEntitlement: 0, earnedEntitlement: 0, processYear };
    }

    const [joinYearStr, joinMonthStr, joinDayStr] = normalizedJoinDate.split('-');
    const joinYear = Number(joinYearStr);
    const joinMonth = Number(joinMonthStr);
    const joinDay = Number(joinDayStr);
    if (!joinYear || !joinMonth || !joinDay) {
      return { fullYearEntitlement: 0, earnedEntitlement: 0, processYear };
    }

    const anniversaryYear = joinYear + 1;
    const anniversaryMonth = joinMonth;
    const anniversaryDay = joinDay;
    const anniversaryTime = Date.UTC(anniversaryYear, anniversaryMonth - 1, anniversaryDay, 0, 0, 0);

    if (anniversaryTime > yearEndTime) {
      return { fullYearEntitlement: 0, earnedEntitlement: 0, processYear };
    }

    if (anniversaryTime < jan1Time) {
      return { fullYearEntitlement: 12, earnedEntitlement: 12, processYear };
    }

    const base = 12 - anniversaryMonth + 1;
    const adjustment = joinDay <= 15 ? 0.0 : joinDay <= 25 ? 0.5 : 1.0;
    const fullYearEntitlement = Math.max(0, Math.min(12, Number((base - adjustment).toFixed(2))));
    const { year: todayYear, month: todayMonth, day: todayDay } = getBangkokTodayParts();
    const todayTime = Date.UTC(todayYear, todayMonth - 1, todayDay, 0, 0, 0);
    const earnedEntitlement = todayTime < anniversaryTime ? 0 : fullYearEntitlement;

    return {
      fullYearEntitlement,
      earnedEntitlement,
      processYear,
    };
  };

  const withRecomputedVacationQuota = async (user: User): Promise<User> => {
    const { fullYearEntitlement, earnedEntitlement } = computeVacationEntitlementByRules(user);
    const processYear = getBangkokTodayParts().year;
    if (isApiMode() && user.id) {
      await loadAttendanceForUser(user.id).catch(() => {});
    }
    const latePenalty = getAttendanceRecords(user.id)
      .filter((r) => String(r.date || '').startsWith(`${processYear}-`) && !!r.checkIn)
      .reduce((sum, r) => sum + calculateLatePenaltyDays(r.checkIn), 0);
    const finalVacationQuota = Math.max(0, Number((earnedEntitlement - latePenalty).toFixed(2)));

    return {
      ...user,
      quotas: {
        ...user.quotas,
        VACATION: finalVacationQuota,
        VACATION_FULL_YEAR_ENTITLEMENT: fullYearEntitlement,
        VACATION_EARNED_ENTITLEMENT: earnedEntitlement,
      },
    };
  };

  const handleSave = () => {
    if (!editingUser) return;
    runAction('admin-save-user', async () => {
      if (editingUser.isResigned === true && !String(editingUser.resignedDate || '').trim()) {
        showAlert('กรุณาเลือกวันที่ลาออก');
        return;
      }
      const toSaveBase: User = {
        ...editingUser,
        name: editingUser.name.trim(),
        email: editingUser.email.trim(),
        position: editingUser.position.trim(),
        department: editingUser.department.trim(),
        resignedDate: editingUser.isResigned ? String(editingUser.resignedDate || '').trim() : '',
        password: editPassword.trim() || editingUser.password,
      };
      try {
        const toSave = isApiMode() ? toSaveBase : await withRecomputedVacationQuota(toSaveBase);
        const result = updateUser(toSave);
        if (result != null && typeof (result as Promise<void>).then === 'function') {
          await (result as Promise<void>);
        }
        if (isApiMode() && toSave.id) {
          await postRecalculateVacationQuotaCurrent(toSave.id);
          await loadFromApi().catch(() => {});
        }
        const latestUsers = getAllUsers();
        setUsers(latestUsers);
        refreshUsers();
        setEditingUser(null);
        setEditPassword('');
        showAlert('บันทึกข้อมูลพนักงานเรียบร้อยแล้ว');
      } catch (err) {
        const msg = err instanceof Error && err.message ? err.message : 'ไม่สามารถอัปเดตข้อมูลได้ กรุณาลองใหม่';
        showAlert(msg);
      }
    });
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    runAction('admin-add-employee', async () => {
      const name = newName.trim();
      const email = newEmail.trim();
      const password = newPassword.trim();
      const position = newPosition.trim();
      const department = newDepartment.trim();
      if (!name || !email || !password || !position || !department || !newJoinDate) {
        showAlert('กรุณากรอกชื่อ อีเมล รหัสผ่าน ตำแหน่ง แผนก และวันเริ่มงาน');
        return;
      }
      if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        showAlert('อีเมลนี้มีในระบบแล้ว');
        return;
      }
      const createdMaybe = addUser({
        name,
        email,
        password,
        role: newRole,
        gender: newGender,
        position,
        department,
        joinDate: newJoinDate,
        managerId: newManagerId || undefined,
        quotas: {},
      }) as unknown;
      const created = createdMaybe != null && typeof (createdMaybe as Promise<User>).then === 'function'
        ? await (createdMaybe as Promise<User>)
        : createdMaybe as User;
      if (created?.id) {
        if (isApiMode()) {
          await postRecalculateVacationQuotaCurrent(created.id);
          await loadFromApi().catch(() => {});
        } else {
          const createdWithQuota = await withRecomputedVacationQuota(created);
          const saveCreatedResult = updateUser(createdWithQuota);
          if (saveCreatedResult && typeof (saveCreatedResult as Promise<void>).then === 'function') {
            await (saveCreatedResult as Promise<void>);
          }
          setUsers((prev) => {
            const idx = prev.findIndex((u) => u.id === createdWithQuota.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = createdWithQuota;
              return next;
            }
            return [...prev, createdWithQuota];
          });
        }
      }
      const latestUsers = getAllUsers();
      setUsers(latestUsers);
      refreshUsers();
      closeAddEmployeeModal();
      showAlert('เพิ่มพนักงานใหม่เรียบร้อยแล้ว');
    });
  };

  const refreshLeaveTypes = () => setLeaveTypes(getLeaveTypes());

  const handleSaveLeaveType = () => {
    if (!editingLeaveType) return;
    runAction('admin-save-leave-type', async () => {
      try {
        const result = updateLeaveType(editingLeaveType.id, {
          label: editingLeaveType.label.trim(),
          applicableTo: editingLeaveType.applicableTo,
          defaultQuota: Math.max(0, Math.floor(Number(editingLeaveType.defaultQuota)) || 0),
        });
        if (result != null && typeof (result as Promise<void>).then === 'function') {
          await (result as Promise<void>);
        }
        refreshLeaveTypes();
        setEditingLeaveType(null);
        showAlert('บันทึกประเภทวันลาเรียบร้อยแล้ว');
      } catch {
        showAlert('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
      }
    });
  };

  const handleAddLeaveType = (e: React.FormEvent) => {
    e.preventDefault();
    runAction('admin-add-leave-type', async () => {
      const label = newLTLabel.trim();
      if (!label) return;
      const quota = Math.max(0, Math.floor(Number(newLTQuota)) || 0);
      try {
        const result = addLeaveType({ label, applicableTo: newLTApplicable, defaultQuota: quota, isActive: true });
        if (result != null && typeof (result as Promise<LeaveTypeDefinition>).then === 'function') {
          await (result as Promise<LeaveTypeDefinition>);
        }
        refreshLeaveTypes();
        closeAddLeaveTypeModal();
        showAlert('เพิ่มประเภทวันลาเรียบร้อยแล้ว');
      } catch {
        showAlert('ไม่สามารถเพิ่มได้ กรุณาลองใหม่');
      }
    });
  };

  const handleToggleLeaveTypeActive = (lt: LeaveTypeDefinition) => {
    const nextActive = !lt.isActive;
    showConfirm(
      nextActive
        ? `ยืนยันเปิดใช้ประเภท "${lt.label}" อีกครั้งหรือไม่?`
        : `ยืนยันปิดใช้ประเภท "${lt.label}" หรือไม่?\n(พนักงานจะไม่เห็นตัวเลือกนี้)`,
      () => {
        runAction(`admin-toggle-leave-type-${lt.id}`, async () => {
          const prevLt = lt;
          setLeaveTypes((cur) => cur.map((t) => (t.id === lt.id ? { ...t, isActive: nextActive } : t)));
          try {
            const result = setLeaveTypeActive(lt.id, nextActive);
            if (result != null && typeof (result as Promise<void>).then === 'function') {
              await (result as Promise<void>);
            }
            refreshLeaveTypes();
            showAlert(nextActive ? 'เปิดใช้ประเภทวันลาเรียบร้อยแล้ว' : 'ปิดใช้ประเภทวันลาเรียบร้อยแล้ว');
          } catch {
            setLeaveTypes((cur) => cur.map((t) => (t.id === lt.id ? prevLt : t)));
            showAlert('ไม่สามารถอัปเดตสถานะได้ กรุณาลองใหม่');
          }
        });
      }
    );
  };

  const handleDeleteEmployee = (user: User) => {
    if (users.length <= 1) {
      showAlert('ไม่สามารถลบได้ ระบบต้องมีพนักงานอย่างน้อย 1 คน');
      return;
    }
    showConfirm(
      `ต้องการลบพนักงาน "${user.name}" ออกจากระบบหรือไม่?\n(ใช้เมื่อพนักงานลาออก)`,
      () => {
        runAction(`admin-delete-user-${user.id}`, async () => {
          setUsers((prev) => prev.filter((u) => u.id !== user.id));
          const result = deleteUser(user.id);
          let ok = result === true;
          if (result != null && typeof (result as Promise<boolean>).then === 'function') {
            try {
              ok = await (result as Promise<boolean>);
            } catch {
              ok = false;
            }
          }
          if (!ok) {
            refreshUsers();
            showAlert('ไม่สามารถลบข้อมูลพนักงานได้ กรุณาลองใหม่');
            return;
          }
          refreshUsers();
          onUserDeleted?.(user.id);
          showAlert('ลบข้อมูลพนักงานเรียบร้อยแล้ว');
        });
      }
    );
  };

  const handleProcessVacationQuota = () => {
    const processYear = getBangkokTodayParts().year;
    const beYear = processYear + 543;
    showConfirm(
      `ต้องการประมวลผลวันลาพักร้อนประจำปี พ.ศ. ${beYear} หรือไม่?\n\nสูตรที่ใช้: ฐานจากเดือนครบรอบ; หักตามวันที่เริ่มงาน — วันที่ 1–15 ไม่หัก / 16–25 หัก 0.5 / หลังวันที่ 25 หัก 1 วัน`,
      () => {
        runAction('admin-process-vacation-quota', async () => {
          if (isApiMode()) {
            const result = await postRecalculateVacationQuotaCurrent();
            await loadFromApi().catch(() => {});
            const latestUsers = getAllUsers();
            setUsers(latestUsers);
            refreshUsers();
            showAlert(`ประมวลผลวันลาพักร้อนประจำปี พ.ศ. ${beYear} เรียบร้อยแล้ว (${result.updatedCount} คน)`);
            return;
          }
          const sourceUsers = getAllUsers();

          const updatedUsers: User[] = [];

          for (const user of sourceUsers) {
            const nextUser = await withRecomputedVacationQuota(user);
            const result = updateUser(nextUser);
            if (result && typeof (result as Promise<void>).then === 'function') {
              await (result as Promise<void>);
            }
            updatedUsers.push(nextUser);
          }

          if (isApiMode()) {
            await loadFromApi().catch(() => {});
          }
          const latestUsers = getAllUsers();
          setUsers(latestUsers.length > 0 ? latestUsers : updatedUsers);
          refreshUsers();
          showAlert(`ประมวลผลวันลาพักร้อนประจำปี พ.ศ. ${beYear} เรียบร้อยแล้ว (${updatedUsers.length} คน)`);
        });
      }
    );
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    runAction('admin-add-holiday', async () => {
      if (!newHolidayDate || !newHolidayName) return;
      const result = saveHoliday(newHolidayDate, newHolidayName);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await (result as Promise<void>);
      }
      setHolidays(getHolidays());
      await refreshHolidaysAudit();
      setNewHolidayDate('');
      setNewHolidayName('');
    });
  };

  const handleDeleteHoliday = (date: string) => {
    if (window.confirm(`ต้องการลบวันหยุดวันที่ ${date} หรือไม่?`)) {
      runAction(`admin-delete-holiday-${date}`, async () => {
        const result = deleteHoliday(date);
        if (result && typeof (result as Promise<void>).then === 'function') {
          await (result as Promise<void>);
        }
        setHolidays(getHolidays());
        await refreshHolidaysAudit();
      });
    }
  };

  const sortedHolidayDates = Object.keys(holidays).sort();
  const activeProjects = useMemo(
    () => timesheetProjects.filter((p) => p.isActive),
    [timesheetProjects]
  );
  const sortedLeaveTypesForAdmin = useMemo(
    () => [...leaveTypes].sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id))),
    [leaveTypes]
  );
  const projectPagination = useTablePagination(activeProjects);
  const employeePagination = useTablePagination(users);
  const leaveTypePagination = useTablePagination(sortedLeaveTypesForAdmin);
  const holidayPagination = useTablePagination(sortedHolidayDates);
  const resetProjectForm = () => {
    setEditProject(null);
    setProjCode('');
    setProjName('');
    setProjManagerId('');
    setAssignedIds([]);
    setTaskTargets(Object.fromEntries(taskTypes.filter((t) => t.isActive).map((t) => [t.id, 0])));
  };

  const handleEditProject = (p: TimesheetProject) => {
    setEditProject(p);
    setProjCode(p.code);
    setProjName(p.name);
    setProjManagerId(p.projectManagerId);
    setAssignedIds([...p.assignedUserIds]);
    const base = Object.fromEntries(taskTypes.filter((t) => t.isActive).map((t) => [t.id, 0]));
    setTaskTargets({ ...base, ...p.taskTargetDays });
    setActiveSubTab('projects');
    setProjectTab('project');
  };

  const handleSaveProject = () => {
    if (!projCode.trim() || !projName.trim() || !projManagerId) {
      showAlert('กรุณากรอกรหัสโครงการ ชื่อโครงการ และ Project Manager');
      return;
    }
    const normalizedPm = users.find((u) => u.id === projManagerId && u.role !== UserRole.EMPLOYEE);
    if (!normalizedPm) {
      showAlert('Project Manager ต้องเป็นระดับ Manager หรือ Admin');
      return;
    }
    runAction('admin-save-project', async () => {
      await Promise.resolve(upsertTimesheetProject({
        id: editProject?.id ?? `P-${Date.now()}`,
        code: projCode.trim().toUpperCase(),
        name: projName.trim(),
        taskTargetDays: taskTargets,
        assignedUserIds: assignedIds,
        projectManagerId: projManagerId,
        isActive: true,
      }));
      refreshTimesheetProjects();
      resetProjectForm();
      showAlert('บันทึกข้อมูลโครงการเรียบร้อยแล้ว');
    });
  };

  const handleAddTaskType = () => {
    const label = newTaskLabel.trim();
    if (!label) {
      showAlert('กรุณาระบุชื่อ Task');
      return;
    }
    runAction('admin-add-task-type', async () => {
      const id = `task-${Date.now()}`;
      const next = [...taskTypes, { id, label, order: taskTypes.length + 1, isActive: true }];
      await Promise.resolve(saveTimesheetTaskTypes(next));
      setTaskTypes(getTimesheetTaskTypes());
      setTaskTargets((prev) => ({ ...prev, [id]: 0 }));
      setNewTaskLabel('');
    });
  };

  const handleTaskLabelChange = (id: string, label: string) => {
    const next = taskTypes.map((t) => t.id === id ? { ...t, label } : t);
    saveTimesheetTaskTypes(next);
    refreshTaskTypes();
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
        <button
          onClick={() => setActiveSubTab('projects')}
          className={`px-4 py-2 rounded-lg text-xs font-black transition ${activeSubTab === 'projects' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ข้อมูลโครงการ
        </button>
        {isAdmin && (
          <>
            <button 
              onClick={() => setActiveSubTab('employees')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition ${activeSubTab === 'employees' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              ข้อมูลพนักงาน
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
              วันหยุดบริษัท
            </button>
            <button
              onClick={() => setActiveSubTab('vacationpolicy')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition ${activeSubTab === 'vacationpolicy' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              กฏการหักลาพักร้อน
            </button>
            <button
              onClick={() => {
                setActiveSubTab('expensetypes');
                runAction('admin-refresh-expense-types', async () => refreshExpenseTypes());
              }}
              aria-busy={isActionBusy('admin-refresh-expense-types')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition ${activeSubTab === 'expensetypes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              ประเภทค่าใช้จ่าย
            </button>
          </>
        )}
      </div>

      {activeSubTab === 'projects' ? (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">ข้อมูลโครงการ (Manager/Admin)</h2>
          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
            <button
              onClick={() => setProjectTab('project')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition ${projectTab === 'project' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              โครงการ
            </button>
            <button
              onClick={() => setProjectTab('task')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition ${projectTab === 'task' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Task งาน
            </button>
          </div>

          {projectTab === 'project' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  รหัสโครงการ (Max Length = {FIELD_MAX_LENGTHS.projectCode})
                  <input value={projCode} maxLength={FIELD_MAX_LENGTHS.projectCode} onChange={(e) => setProjCode(e.target.value)} placeholder="รหัสโครงการ" className="mt-1 px-3 py-2 border rounded-xl text-sm font-bold w-full normal-case tracking-normal text-gray-900" />
                </label>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest md:col-span-2">
                  ชื่อโครงการ (Max Length = {FIELD_MAX_LENGTHS.projectName})
                  <input value={projName} maxLength={FIELD_MAX_LENGTHS.projectName} onChange={(e) => setProjName(e.target.value)} placeholder="ชื่อโครงการ" className="mt-1 px-3 py-2 border rounded-xl text-sm font-bold w-full normal-case tracking-normal text-gray-900" />
                </label>
                <select value={projManagerId} onChange={(e) => setProjManagerId(e.target.value)} className="px-3 py-2 border rounded-xl text-sm font-bold md:col-span-3">
                  <option value="">เลือก Project Manager</option>
                  {users.filter((u) => u.role !== UserRole.EMPLOYEE).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-black text-gray-500 mb-2">กำหนดพนักงานในโครงการ (จัดกลุ่มตามแผนก)</p>
                <div className="max-h-56 overflow-auto border rounded-xl p-3 space-y-3">
                  {usersByDepartment.map(([dept, deptUsers]) => (
                    <div key={dept} className="space-y-2">
                      <p className="text-[11px] font-black text-indigo-700">{dept}</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {deptUsers.map((u) => (
                          <label key={u.id} className="text-xs font-bold flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={assignedIds.includes(u.id)}
                              onChange={(e) => {
                                setAssignedIds((prev) => e.target.checked ? Array.from(new Set([...prev, u.id])) : prev.filter((id) => id !== u.id));
                              }}
                            />
                            {u.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {taskTypes.filter((t) => t.isActive).map((t) => (
                  <label key={t.id} className="text-xs font-bold">
                    {t.label} (วัน)
                    <input
                      type="number"
                      min={0}
                      max={999}
                      step="0.25"
                      value={taskTargets[t.id] ?? 0}
                      onChange={(e) =>
                        setTaskTargets((prev) => ({
                          ...prev,
                          [t.id]: Math.min(999, Math.max(0, Number(e.target.value) || 0)),
                        }))
                      }
                      className="mt-1 w-full px-2 py-2 border rounded-xl text-sm font-bold"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveProject}
                  disabled={isActionBusy('admin-save-project')}
                  aria-busy={isActionBusy('admin-save-project')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black disabled:opacity-50"
                >
                  {editProject ? 'บันทึกการแก้ไขโครงการ' : 'เพิ่มโครงการ'}
                </button>
                {editProject && <button onClick={resetProjectForm} className="px-4 py-2 bg-gray-200 rounded-xl text-sm font-black">ยกเลิกแก้ไข</button>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400">
                      <th className="py-2">รหัส</th>
                      <th className="py-2">ชื่อโครงการ</th>
                      <th className="py-2">PM</th>
                      <th className="py-2">แก้ไขล่าสุดโดย</th>
                      <th className="py-2 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectPagination.pagedItems.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="py-2 font-black">{p.code}</td>
                        <td className="py-2">{p.name}</td>
                        <td className="py-2">{users.find((u) => u.id === p.projectManagerId)?.name || '-'}</td>
                        <td className="py-2 text-[11px] font-medium text-gray-500">{formatUpdatedByWithTime(p.updatedByName, p.updatedAt)}</td>
                        <td className="py-2 text-right"><button onClick={() => handleEditProject(p)} className="text-blue-600 text-xs font-black">แก้ไข</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={projectPagination.page}
                pageSize={projectPagination.pageSize}
                totalItems={projectPagination.totalItems}
                totalPages={projectPagination.totalPages}
                rangeStart={projectPagination.rangeStart}
                rangeEnd={projectPagination.rangeEnd}
                onPageChange={projectPagination.setPage}
                onPageSizeChange={projectPagination.setPageSize}
              />
            </>
          ) : (
            <div className="border rounded-xl p-3 space-y-2">
              <p className="text-xs font-black text-gray-600">ตั้งค่า Task งาน (Admin)</p>
              <div className="flex gap-2">
                <label className="flex-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  ชื่อ Task ใหม่ (Max Length = {FIELD_MAX_LENGTHS.taskLabel})
                  <input
                    value={newTaskLabel}
                    maxLength={FIELD_MAX_LENGTHS.taskLabel}
                    onChange={(e) => setNewTaskLabel(e.target.value)}
                    placeholder="เพิ่มชื่อ Task ใหม่ เช่น Review"
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm font-bold normal-case tracking-normal text-gray-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAddTaskType}
                  disabled={!isAdmin || isActionBusy('admin-add-task-type')}
                  aria-busy={isActionBusy('admin-add-task-type')}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black disabled:opacity-40"
                >
                  เพิ่ม Task
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {taskTypes.filter((t) => t.isActive).map((t) => (
                  <div key={`cfg-${t.id}`} className="flex items-center gap-2">
                    <input
                      value={t.label}
                      maxLength={FIELD_MAX_LENGTHS.taskLabel}
                      onChange={(e) => handleTaskLabelChange(t.id, e.target.value)}
                      disabled={!isAdmin}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm font-bold disabled:bg-gray-100"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : activeSubTab === 'employees' ? (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              ข้อมูลพนักงาน
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openAddEmployeeModal}
                className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 transition shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                เพิ่มพนักงาน
              </button>
              <button
                type="button"
                onClick={handleProcessVacationQuota}
                disabled={isActionBusy('admin-process-vacation-quota')}
                aria-busy={isActionBusy('admin-process-vacation-quota')}
                className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-2xl font-black text-sm hover:bg-amber-600 transition shadow-lg"
                title="คำนวณโควต้าลาพักร้อนด้วย SQL แบบ bulk ตามกติกาปัจจุบัน"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                ประมวลผลวันลาพักร้อน
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">พนักงาน</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">ตำแหน่ง</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">แผนก</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">บทบาท</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">ผู้บังคับบัญชา</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-center">ลาพักร้อน</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-center">Suspend</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">แก้ไขล่าสุดโดย</th>
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
                  return employeePagination.pagedItems.map(user => {
                    const manager = users.find(u => u.id === user.managerId);
                    const effectiveQuota = user.quotas['VACATION'] ?? defaultVacation;
                    const used = vacationUsedByUser[user.id] ?? 0;
                    const remaining = effectiveQuota - used;
                    return (
                    <tr key={user.id} className="hover:bg-gray-50 transition group">
                      <td className="px-6 py-4">
                        <div className="font-black text-gray-900">{user.name}</div>
                        <div className="text-[10px] text-gray-400 font-bold">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-sky-100 px-2 py-1 rounded text-[10px] font-bold text-sky-700">{user.position || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold text-gray-600">{user.department || '-'}</span>
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
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={user.isSuspended === true}
                          aria-busy={isActionBusy(`admin-toggle-suspend-${user.id}`)}
                          disabled={isActionBusy(`admin-toggle-suspend-${user.id}`)}
                          title={user.isSuspended ? 'Suspend: ON' : 'Suspend: OFF'}
                          onClick={() => {
                            const next = !(user.isSuspended === true);
                            showConfirm(
                              next
                                ? `ยืนยันระงับการใช้งานบัญชีของ "${user.name}" หรือไม่?`
                                : `ยืนยันปลดระงับการใช้งานบัญชีของ "${user.name}" หรือไม่?\n(ระบบจะรีเซ็ตจำนวนครั้งที่ลงชื่อเข้าใช้ไม่สำเร็จเป็น 0)`,
                              () => {
                                runAction(`admin-toggle-suspend-${user.id}`, async () => {
                                  const patch = { ...user, isSuspended: next, failedLoginAttempts: next ? (user.failedLoginAttempts ?? 0) : 0 };
                                  setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...patch } : u)));
                                  try {
                                    const result = updateUser(patch);
                                    if (result != null && typeof (result as Promise<void>).then === 'function') {
                                      await (result as Promise<void>);
                                    }
                                    refreshUsers();
                                    showAlert(next ? 'ระงับการใช้งานบัญชีเรียบร้อยแล้ว' : 'ปลดระงับการใช้งานบัญชีเรียบร้อยแล้ว');
                                  } catch {
                                    setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
                                    showAlert('ไม่สามารถอัปเดตสถานะ Suspend ได้ กรุณาลองใหม่');
                                  }
                                });
                              }
                            );
                          }}
                          className={`relative inline-flex h-7 w-14 items-center rounded-full border transition ${
                            user.isSuspended ? 'bg-emerald-500 border-emerald-600' : 'bg-gray-200 border-gray-300'
                          }`}
                        >
                          <span className="sr-only">Suspend</span>
                          <span
                            className={`absolute left-1 text-[10px] font-black tracking-widest text-white transition-opacity ${
                              user.isSuspended ? 'opacity-100' : 'opacity-0'
                            }`}
                          >
                            ON
                          </span>
                          <span
                            className={`absolute right-1 text-[10px] font-black tracking-widest text-gray-500 transition-opacity ${
                              user.isSuspended ? 'opacity-0' : 'opacity-100'
                            }`}
                          >
                            OFF
                          </span>
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                              user.isSuspended ? 'translate-x-7' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-[11px] font-medium text-gray-500">{formatUpdatedByWithTime(user.updatedByName, user.updatedAt)}</td>
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
                            disabled={users.length <= 1 || isActionBusy(`admin-delete-user-${user.id}`)}
                            aria-busy={isActionBusy(`admin-delete-user-${user.id}`)}
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
          <TablePagination
            page={employeePagination.page}
            pageSize={employeePagination.pageSize}
            totalItems={employeePagination.totalItems}
            totalPages={employeePagination.totalPages}
            rangeStart={employeePagination.rangeStart}
            rangeEnd={employeePagination.rangeEnd}
            onPageChange={employeePagination.setPage}
            onPageSizeChange={employeePagination.setPageSize}
          />
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
            <button type="button" onClick={openAddLeaveTypeModal} className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              เพิ่มประเภทวันลา
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">กำหนดชื่อประเภท ใช้กับเพศใด และโควต้าวันต่อปี — พนักงานชายจะไม่เห็นประเภทที่ตั้งเป็นหญิงเท่านั้น (เช่น ลาคลอด)</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">ชื่อประเภท</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">ใช้กับ</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-center">โควต้า (วัน/ปี)</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-center">ปิดใช้</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest">แก้ไขล่าสุดโดย</th>
                  <th className="px-6 py-4 font-black text-gray-400 uppercase text-[10px] tracking-widest text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaveTypePagination.pagedItems.map(lt => (
                  <tr key={lt.id} className={`hover:bg-gray-50 ${lt.isActive ? '' : 'opacity-70'}`}>
                    <td className={`px-6 py-4 font-bold text-gray-900 ${lt.isActive ? '' : 'line-through decoration-gray-400'}`}>{lt.label}</td>
                    <td className="px-6 py-4"><span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold text-gray-600">{APPLICABLE_LABELS[lt.applicableTo]}</span></td>
                    <td className="px-6 py-4 text-center font-black text-indigo-600">{lt.defaultQuota >= 999 ? 'ไม่จำกัด' : lt.defaultQuota}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={lt.isActive === false}
                        aria-busy={isActionBusy(`admin-toggle-leave-type-${lt.id}`)}
                        disabled={isActionBusy(`admin-toggle-leave-type-${lt.id}`)}
                        title={lt.isActive ? 'ปิดใช้: OFF' : 'ปิดใช้: ON'}
                        onClick={() => handleToggleLeaveTypeActive(lt)}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full border transition ${
                          lt.isActive ? 'bg-gray-200 border-gray-300' : 'bg-emerald-500 border-emerald-600'
                        }`}
                      >
                        <span className="sr-only">ปิดใช้ประเภทวันลา</span>
                        <span
                          className={`absolute left-1 text-[10px] font-black tracking-widest text-white transition-opacity ${
                            lt.isActive ? 'opacity-0' : 'opacity-100'
                          }`}
                        >
                          ON
                        </span>
                        <span
                          className={`absolute right-1 text-[10px] font-black tracking-widest text-gray-500 transition-opacity ${
                            lt.isActive ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          OFF
                        </span>
                        <span
                          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                            lt.isActive ? 'translate-x-0' : 'translate-x-7'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-[11px] font-medium text-gray-500">{formatUpdatedByWithTime(lt.updatedByName, lt.updatedAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <button type="button" onClick={() => setEditingLeaveType({ ...lt })} className="text-xs font-black text-blue-600 hover:text-blue-800">แก้ไข</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={leaveTypePagination.page}
            pageSize={leaveTypePagination.pageSize}
            totalItems={leaveTypePagination.totalItems}
            totalPages={leaveTypePagination.totalPages}
            rangeStart={leaveTypePagination.rangeStart}
            rangeEnd={leaveTypePagination.rangeEnd}
            onPageChange={leaveTypePagination.setPage}
            onPageSizeChange={leaveTypePagination.setPageSize}
          />

          {showAddLeaveType && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
                <h3 className="text-lg font-black text-gray-900 mb-4">เพิ่มประเภทวันลา</h3>
                <form onSubmit={handleAddLeaveType} className="space-y-4">
                  <p className="text-[11px] font-bold text-gray-500">
                    <span className="text-red-500">*</span> Required field
                  </p>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                      ชื่อประเภท <span className="text-red-500">*</span> (Max Length = {FIELD_MAX_LENGTHS.leaveTypeLabel})
                    </label>
                    <input type="text" required maxLength={FIELD_MAX_LENGTHS.leaveTypeLabel} value={newLTLabel} onChange={(e) => setNewLTLabel(e.target.value)} placeholder="เช่น ลาคลอด" className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold" />
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
                    <button type="submit" disabled={isActionBusy('admin-add-leave-type')} aria-busy={isActionBusy('admin-add-leave-type')} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm disabled:opacity-50">บันทึก</button>
                    <button type="button" onClick={closeAddLeaveTypeModal} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-black text-sm">ยกเลิก</button>
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
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">ชื่อประเภท (Max Length = {FIELD_MAX_LENGTHS.leaveTypeLabel})</label>
                    <input type="text" maxLength={FIELD_MAX_LENGTHS.leaveTypeLabel} value={editingLeaveType.label} onChange={(e) => setEditingLeaveType(prev => prev ? { ...prev, label: e.target.value } : prev)} className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold" />
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
                    <button type="button" onClick={handleSaveLeaveType} disabled={isActionBusy('admin-save-leave-type')} aria-busy={isActionBusy('admin-save-leave-type')} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm disabled:opacity-50">บันทึก</button>
                    <button type="button" onClick={() => setEditingLeaveType(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-black text-sm">ยกเลิก</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeSubTab === 'expensetypes' ? (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900">จัดการประเภทค่าใช้จ่าย (Admin)</h2>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <label className="flex-1 min-w-[240px] text-[10px] font-black text-gray-400 uppercase tracking-widest">
              ชื่อประเภทค่าใช้จ่าย (Max Length = {FIELD_MAX_LENGTHS.expenseTypeLabel})
              <input
                value={newExpenseLabel}
                maxLength={FIELD_MAX_LENGTHS.expenseTypeLabel}
                onChange={(e) => setNewExpenseLabel(e.target.value)}
                placeholder="เช่น ค่าเดินทาง / ค่าเครื่องเขียน / ค่า Messenger"
                className="mt-1 w-full px-3 py-2 border rounded-xl text-sm font-bold normal-case tracking-normal text-gray-900"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const label = newExpenseLabel.trim();
                if (!label) return;
                runAction('admin-add-expense-type', async () => {
                  try {
                    await postExpenseType({ label, isActive: true });
                    setNewExpenseLabel('');
                    refreshExpenseTypes();
                    showAlert('เพิ่มประเภทค่าใช้จ่ายเรียบร้อยแล้ว');
                  } catch (err) {
                    showAlert(err instanceof Error ? err.message : 'เพิ่มประเภทค่าใช้จ่ายไม่สำเร็จ');
                  }
                });
              }}
              disabled={isActionBusy('admin-add-expense-type')}
              aria-busy={isActionBusy('admin-add-expense-type')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black"
            >
              เพิ่มประเภท
            </button>
          </div>
          <div className="space-y-2">
            {expenseTypes.map((t) => (
              <div key={t.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
                <div>
                  <span className={`text-sm font-bold ${t.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{t.label}</span>
                  <p className="text-[11px] font-medium text-gray-500">{formatUpdatedByWithTime(t.updatedByName, t.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = window.prompt('แก้ไขชื่อประเภทค่าใช้จ่าย', t.label);
                      if (!updated || !updated.trim()) return;
                      runAction(`admin-edit-expense-type-${t.id}`, async () => {
                        try {
                          await postExpenseType({ id: t.id, label: updated.trim(), isActive: true });
                          refreshExpenseTypes();
                          showAlert('บันทึกการแก้ไขเรียบร้อยแล้ว');
                        } catch (err) {
                          showAlert(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
                        }
                      });
                    }}
                    disabled={isActionBusy(`admin-edit-expense-type-${t.id}`)}
                    aria-busy={isActionBusy(`admin-edit-expense-type-${t.id}`)}
                    className="text-xs font-black text-blue-600"
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      showConfirm(`ต้องการปิดใช้ประเภท "${t.label}" หรือไม่?`, () => {
                        runAction(`admin-delete-expense-type-${t.id}`, async () => {
                          try {
                            await deleteExpenseType(t.id);
                            refreshExpenseTypes();
                            showAlert('ปิดใช้ประเภทค่าใช้จ่ายเรียบร้อยแล้ว');
                          } catch (err) {
                            showAlert(err instanceof Error ? err.message : 'ลบประเภทค่าใช้จ่ายไม่สำเร็จ');
                          }
                        });
                      });
                    }}
                    disabled={isActionBusy(`admin-delete-expense-type-${t.id}`)}
                    aria-busy={isActionBusy(`admin-delete-expense-type-${t.id}`)}
                    className="text-xs font-black text-rose-600"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
            {expenseTypes.length === 0 && (
              <div className="text-sm text-gray-400 italic py-6 text-center">ยังไม่มีประเภทค่าใช้จ่าย</div>
            )}
          </div>
        </div>
      ) : activeSubTab === 'vacationpolicy' ? (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">กฏการหักลาพักร้อน</h2>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
            <h4 className="text-sm font-black text-indigo-900 mb-3">กฏการหักลาพักร้อนกรณีเข้างานสาย</h4>
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
                      max={12}
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
                รองรับหลายช่วงเวลา: ระบบจะใช้อัตราหักของช่วงที่ตรงกับเวลาเช็คอินล่าสุดโดยอัตโนมัติ (จำกัดค่าสูงสุด 12 วันต่อช่วง)
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
                  disabled={isActionBusy('admin-save-late-policy')}
                  aria-busy={isActionBusy('admin-save-late-policy')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeSubTab === 'holidays' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <form onSubmit={handleAddHoliday} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
              <h3 className="font-black text-gray-900 mb-6 flex items-center gap-2">
                <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                เพิ่มวันหยุด
              </h3>
              <p className="text-[11px] font-bold text-gray-500 mb-4">
                <span className="text-red-500">*</span> Required field
              </p>
              <div className="space-y-6">
                <DatePicker 
                  label="วันที่"
                  required
                  value={newHolidayDate}
                  onChange={setNewHolidayDate}
                  placeholder="เลือกวันหยุด"
                />
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">
                    ชื่อวันหยุด <span className="text-red-500">*</span> (Max Length = {FIELD_MAX_LENGTHS.holidayName})
                  </label>
                  <input 
                    type="text" 
                    required
                    maxLength={FIELD_MAX_LENGTHS.holidayName}
                    placeholder="เช่น วันสงกรานต์"
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    className="w-full p-4 bg-white border-2 border-gray-200 rounded-2xl outline-none focus:border-blue-500 font-bold text-sm transition"
                  />
                </div>
                <button type="submit" disabled={isActionBusy('admin-add-holiday')} aria-busy={isActionBusy('admin-add-holiday')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition shadow-xl shadow-blue-50 disabled:opacity-50">
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
                    <th className="px-6 py-4 text-left font-black text-gray-400 uppercase text-[10px] tracking-widest">แก้ไขล่าสุดโดย</th>
                    <th className="px-6 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {holidayPagination.pagedItems.map(date => (
                    <tr key={date} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-bold text-gray-700">
                        {formatYmdAsDdMmBe(date)}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">{holidays[date]}</td>
                      <td className="px-6 py-4 text-[11px] font-medium text-gray-500">{formatUpdatedByWithTime(holidayUpdatedBy[date], holidayUpdatedAt[date])}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteHoliday(date)}
                          disabled={isActionBusy(`admin-delete-holiday-${date}`)}
                          aria-busy={isActionBusy(`admin-delete-holiday-${date}`)}
                          className="text-rose-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition disabled:opacity-40"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sortedHolidayDates.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-bold italic">ไม่พบข้อมูลวันหยุด</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 pb-4">
              <TablePagination
                page={holidayPagination.page}
                pageSize={holidayPagination.pageSize}
                totalItems={holidayPagination.totalItems}
                totalPages={holidayPagination.totalPages}
                rangeStart={holidayPagination.rangeStart}
                rangeEnd={holidayPagination.rangeEnd}
                onPageChange={holidayPagination.setPage}
                onPageSizeChange={holidayPagination.setPageSize}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[32px] max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden">
            <div className="max-h-[90vh] overflow-y-auto p-8 pr-6 custom-scrollbar">
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
              </div>
              เพิ่มพนักงานใหม่
            </h3>
            <p className="text-[11px] font-bold text-gray-500 mb-4">
              <span className="text-red-500">*</span> Required field
            </p>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">
                  ชื่อ-นามสกุล <span className="text-red-500">*</span> (Max Length = {FIELD_MAX_LENGTHS.employeeName})
                </label>
                <input type="text" required maxLength={FIELD_MAX_LENGTHS.employeeName} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="นาย/นาง/นางสาว ..." className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">
                  อีเมล <span className="text-red-500">*</span> (Max Length = {FIELD_MAX_LENGTHS.email})
                </label>
                <input type="email" required maxLength={FIELD_MAX_LENGTHS.email} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@company.com" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">
                  รหัสผ่าน (ใช้เข้าสู่ระบบ) <span className="text-red-500">*</span> (Max Length = {FIELD_MAX_LENGTHS.password})
                </label>
                <input type="text" required maxLength={FIELD_MAX_LENGTHS.password} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="รหัสผ่านเริ่มต้น" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
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
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">
                  ตำแหน่ง <span className="text-red-500">*</span> (Max Length = {FIELD_MAX_LENGTHS.position})
                </label>
                <input type="text" required maxLength={FIELD_MAX_LENGTHS.position} value={newPosition} onChange={(e) => setNewPosition(e.target.value)} placeholder="เช่น Senior Developer" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">
                  แผนก <span className="text-red-500">*</span> (Max Length = {FIELD_MAX_LENGTHS.department})
                </label>
                <input type="text" required maxLength={FIELD_MAX_LENGTHS.department} value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="เช่น Finance" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">
                  วันเริ่มงาน <span className="text-red-500">*</span>
                </label>
                <DatePicker value={newJoinDate} onChange={setNewJoinDate} label="" required />
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
                <button type="submit" disabled={isActionBusy('admin-add-employee')} aria-busy={isActionBusy('admin-add-employee')} className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black text-sm hover:bg-emerald-700 transition disabled:opacity-50">
                  บันทึก
                </button>
                <button type="button" onClick={closeAddEmployeeModal} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-2xl font-black text-sm hover:bg-gray-200 transition">
                  ยกเลิก
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden">
            <div className="max-h-[90vh] overflow-y-auto p-8 pr-6 custom-scrollbar">
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
              แก้ไขข้อมูล: {editingUser.name}
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">ชื่อ-นามสกุล (Max Length = {FIELD_MAX_LENGTHS.employeeName})</label>
                <input type="text" maxLength={FIELD_MAX_LENGTHS.employeeName} value={editingUser.name} onChange={(e) => setEditingUser(prev => prev ? { ...prev, name: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">อีเมล (Max Length = {FIELD_MAX_LENGTHS.email})</label>
                <input type="email" maxLength={FIELD_MAX_LENGTHS.email} value={editingUser.email} onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">เปลี่ยนรหัสผ่าน (เว้นว่างถ้าไม่เปลี่ยน) (Max Length = {FIELD_MAX_LENGTHS.password})</label>
                <input type="text" maxLength={FIELD_MAX_LENGTHS.password} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="รหัสผ่านใหม่" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
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
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">ตำแหน่ง (Max Length = {FIELD_MAX_LENGTHS.position})</label>
                <input type="text" maxLength={FIELD_MAX_LENGTHS.position} value={editingUser.position} onChange={(e) => setEditingUser(prev => prev ? { ...prev, position: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">แผนก (Max Length = {FIELD_MAX_LENGTHS.department})</label>
                <input type="text" maxLength={FIELD_MAX_LENGTHS.department} value={editingUser.department} onChange={(e) => setEditingUser(prev => prev ? { ...prev, department: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">วันเริ่มงาน</label>
                <DatePicker value={editingUser.joinDate} onChange={(v) => setEditingUser(prev => prev ? { ...prev, joinDate: v } : prev)} label="" />
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">พนักงานลาออก</p>
                    <p className="text-xs font-bold text-gray-600">เปิดเมื่อพนักงานพ้นสภาพการทำงาน</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editingUser.isResigned === true}
                    onClick={() => setEditingUser(prev => prev ? {
                      ...prev,
                      isResigned: !(prev.isResigned === true),
                      resignedDate: !(prev.isResigned === true) ? prev.resignedDate : '',
                    } : prev)}
                    className={`relative inline-flex h-8 w-16 items-center rounded-full border-2 transition ${
                      editingUser.isResigned ? 'bg-rose-500 border-rose-600' : 'bg-gray-200 border-gray-300'
                    }`}
                  >
                    <span className={`absolute left-2 text-[9px] font-black uppercase transition ${editingUser.isResigned ? 'opacity-100 text-white' : 'opacity-0 text-gray-500'}`}>ON</span>
                    <span className={`absolute right-2 text-[9px] font-black uppercase transition ${editingUser.isResigned ? 'opacity-0 text-white' : 'opacity-100 text-gray-500'}`}>OFF</span>
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${editingUser.isResigned ? 'translate-x-8' : 'translate-x-0'}`} />
                  </button>
                </div>
                {editingUser.isResigned && (
                  <div className="mt-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">วันที่ลาออก <span className="text-red-500">*</span></label>
                    <DatePicker
                      value={editingUser.resignedDate || ''}
                      onChange={(v) => setEditingUser(prev => prev ? { ...prev, resignedDate: v } : prev)}
                      label=""
                      disableHolidayWeekend={false}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">ผู้บังคับบัญชา</label>
                <select value={editingUser.managerId || ''} onChange={(e) => setEditingUser(prev => prev ? { ...prev, managerId: e.target.value } : prev)} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 text-sm font-bold">
                  <option value="">— ยังไม่ได้กำหนด —</option>
                  {users.filter(u => u.id !== editingUser.id && (u.role === UserRole.MANAGER || u.role === UserRole.ADMIN)).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={handleSave} disabled={isActionBusy('admin-save-user')} aria-busy={isActionBusy('admin-save-user')} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 transition shadow-xl shadow-blue-50 disabled:opacity-50">
                บันทึกการเปลี่ยนแปลง
              </button>
              <button type="button" onClick={() => { setEditingUser(null); setEditPassword(''); }} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black hover:bg-gray-200 transition">
                ยกเลิก
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
