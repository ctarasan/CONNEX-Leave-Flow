import React, { useMemo, useState } from 'react';
import { TimesheetEntry, User, UserRole } from '../types';
import {
  getAllUsers,
  getSubordinateIdsRecursive,
  getTimesheetEntries,
  getTimesheetEntriesByDate,
  getTimesheetProjects,
  getTimesheetProjectsForUser,
  getTimesheetTaskTypes,
  saveTimesheetEntry,
} from '../store';
import { useAlert } from '../AlertContext';
import DatePicker from './DatePicker';
import { formatYmdAsDdMmBe } from '../utils';

interface TimesheetModuleProps {
  currentUser: User;
  onUpdate: () => void;
}

const hoursText = (minutes: number): string => `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;

const toIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfWeek = (d: Date): Date => {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

const TimesheetModule: React.FC<TimesheetModuleProps> = ({ currentUser, onUpdate }) => {
  const { showAlert } = useAlert();
  const [selectedDate, setSelectedDate] = useState<string>(toIso(new Date()));
  const [draftProjectId, setDraftProjectId] = useState('');
  const [draftTaskType, setDraftTaskType] = useState<string>('');
  const [draftHours, setDraftHours] = useState(8);
  const [draftMinutes, setDraftMinutes] = useState(0);
  const [teamUserId, setTeamUserId] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const todayIso = toIso(new Date());

  const allUsers = useMemo(() => getAllUsers(), [refreshTick]);
  const allProjects = useMemo(() => getTimesheetProjects(), [refreshTick]);
  const taskTypes = useMemo(() => getTimesheetTaskTypes().filter((t) => t.isActive), [refreshTick]);
  const taskLabelMap = useMemo(() => new Map(taskTypes.map((t) => [t.id, t.label])), [taskTypes]);
  const userProjects = useMemo(() => getTimesheetProjectsForUser(currentUser.id), [currentUser.id, refreshTick]);
  const normalizedTaskType = draftTaskType || taskTypes[0]?.id || '';
  const selectedDateEntries = useMemo(() => getTimesheetEntriesByDate(currentUser.id, selectedDate), [currentUser.id, selectedDate, refreshTick]);
  const selectedMonth = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);
  const isManagerOrAdmin = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.ADMIN;

  const myEntries = useMemo(() => getTimesheetEntries(currentUser.id), [currentUser.id, refreshTick]);

  const dailyMinutes = useMemo(
    () => myEntries.filter((e) => e.date === selectedDate).reduce((s, e) => s + e.minutes, 0),
    [myEntries, selectedDate]
  );
  const weeklyMinutes = useMemo(() => {
    const start = startOfWeek(selectedMonth);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return myEntries
      .filter((e) => {
        const d = new Date(`${e.date}T00:00:00`);
        return d >= start && d <= end;
      })
      .reduce((s, e) => s + e.minutes, 0);
  }, [myEntries, selectedMonth]);
  const monthlyMinutes = useMemo(() => {
    const y = selectedMonth.getFullYear();
    const m = selectedMonth.getMonth();
    return myEntries
      .filter((e) => {
        const d = new Date(`${e.date}T00:00:00`);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((s, e) => s + e.minutes, 0);
  }, [myEntries, selectedMonth]);

  const projectSummary = useMemo(() => {
    const byProject: Record<string, number> = {};
    for (const e of myEntries) byProject[e.projectId] = (byProject[e.projectId] ?? 0) + e.minutes;
    return userProjects
      .map((p) => ({ projectId: p.id, projectName: `${p.code} - ${p.name}`, minutes: byProject[p.id] ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [myEntries, userProjects]);

  const monthCalendar = useMemo(() => {
    const y = selectedMonth.getFullYear();
    const m = selectedMonth.getMonth();
    const first = new Date(y, m, 1);
    const start = startOfWeek(first);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [selectedMonth]);

  const dayTotalMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of myEntries) map.set(e.date, (map.get(e.date) ?? 0) + e.minutes);
    return map;
  }, [myEntries]);

  const teamCandidates = useMemo(() => {
    if (currentUser.role === UserRole.ADMIN) return allUsers.filter((u) => u.id !== currentUser.id);
    if (currentUser.role === UserRole.MANAGER) {
      const ids = getSubordinateIdsRecursive(currentUser.id, allUsers);
      return allUsers.filter((u) => ids.includes(u.id));
    }
    return [];
  }, [allUsers, currentUser.id, currentUser.role]);

  const activeTeamUserId = teamUserId || teamCandidates[0]?.id || '';
  const teamEntries = useMemo(() => (activeTeamUserId ? getTimesheetEntries(activeTeamUserId) : []), [activeTeamUserId, refreshTick]);
  const teamDayMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of teamEntries) map.set(e.date, (map.get(e.date) ?? 0) + e.minutes);
    return map;
  }, [teamEntries]);

  const saveEntry = () => {
    if (selectedDate > todayIso) {
      showAlert('ไม่สามารถลง Timesheet ล่วงหน้าได้ (เลือกได้เฉพาะวันนี้หรือย้อนหลัง)');
      return;
    }
    if (!draftProjectId) {
      showAlert('กรุณาเลือกโครงการก่อนบันทึก Timesheet');
      return;
    }
    if (!normalizedTaskType) {
      showAlert('ยังไม่มีประเภท Task ให้เลือก กรุณาให้ Admin ตั้งค่า Task ก่อน');
      return;
    }
    saveTimesheetEntry({
      userId: currentUser.id,
      date: selectedDate,
      projectId: draftProjectId,
      taskType: normalizedTaskType,
      minutes: Math.max(0, draftHours * 60 + draftMinutes),
    });
    setRefreshTick((v) => v + 1);
    onUpdate();
    showAlert('บันทึก Timesheet เรียบร้อยแล้ว');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-lg font-black text-gray-900">Timesheet Calendar</h3>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="min-w-[140px] max-w-[200px]">
            <DatePicker label="" value={selectedDate} onChange={setSelectedDate} maxDate={todayIso} size="compact" />
          </div>
          <p className="text-sm font-bold text-gray-600">
            วันที่เลือก: {formatYmdAsDdMmBe(selectedDate)}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((d) => <div key={d} className="text-center text-xs font-black text-gray-400">{d}</div>)}
          {monthCalendar.map((d) => {
            const iso = toIso(d);
            const total = dayTotalMap.get(iso) ?? 0;
            const isCurrentMonth = d.getMonth() === selectedMonth.getMonth();
            const isSelected = iso === selectedDate;
            const overtime = total > 8 * 60;
            return (
              <button
                key={iso}
                onClick={() => {
                  if (iso > todayIso) {
                    showAlert('ไม่สามารถเลือกวันล่วงหน้าเพื่อบันทึก Timesheet ได้');
                    return;
                  }
                  setSelectedDate(iso);
                }}
                disabled={iso > todayIso}
                className={`min-h-20 rounded-xl border p-2 text-left transition ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white hover:border-blue-200'
                } ${!isCurrentMonth ? 'opacity-40' : ''} ${iso > todayIso ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <div className="text-xs font-black text-gray-700">{d.getDate()}</div>
                <div className={`text-[10px] font-bold mt-1 ${overtime ? 'text-rose-600' : 'text-gray-500'}`}>
                  {total > 0 ? hoursText(total) : '-'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-2xl p-4"><p className="text-xs text-gray-500 font-bold">รวมต่อวัน</p><p className="text-xl font-black">{hoursText(dailyMinutes)}</p></div>
        <div className="bg-white border rounded-2xl p-4"><p className="text-xs text-gray-500 font-bold">รวมต่อสัปดาห์</p><p className="text-xl font-black">{hoursText(weeklyMinutes)}</p></div>
        <div className="bg-white border rounded-2xl p-4"><p className="text-xs text-gray-500 font-bold">รวมต่อเดือน</p><p className="text-xl font-black">{hoursText(monthlyMinutes)}</p></div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-200 p-6">
        <h4 className="font-black mb-3">จัดการรายการของวันที่เลือก</h4>
        <div className="border rounded-xl p-3 mb-3 space-y-3 bg-gray-50">
          <p className="text-xs font-black text-gray-600">เพิ่มรายการใหม่ของวันที่เลือก</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={draftProjectId} onChange={(e) => setDraftProjectId(e.target.value)} className="px-3 py-2 border rounded-xl text-sm font-bold min-w-60 bg-white">
              <option value="">เลือกโครงการที่ได้รับมอบหมาย</option>
              {userProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
              ))}
            </select>
            <select value={normalizedTaskType} onChange={(e) => setDraftTaskType(e.target.value)} className="px-3 py-2 border rounded-xl text-sm font-bold bg-white">
              {taskTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <div className="flex items-center gap-1 bg-white rounded-xl border px-2 py-1">
              <input type="number" min={0} max={24} value={draftHours} onChange={(e) => setDraftHours(Number(e.target.value) || 0)} className="w-16 px-2 py-1 text-sm font-bold outline-none" />
              <span className="text-xs font-black text-gray-500">ชั่วโมง</span>
            </div>
            <div className="flex items-center gap-1 bg-white rounded-xl border px-2 py-1">
              <input type="number" min={0} max={59} value={draftMinutes} onChange={(e) => setDraftMinutes(Number(e.target.value) || 0)} className="w-16 px-2 py-1 text-sm font-bold outline-none" />
              <span className="text-xs font-black text-gray-500">นาที</span>
            </div>
            <button onClick={saveEntry} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-black">เพิ่มรายการ</button>
          </div>
        </div>
        <div className="space-y-2">
          {selectedDateEntries.map((e) => {
            const p = allProjects.find((x) => x.id === e.projectId);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 border rounded-xl p-3">
                <span className="text-sm font-bold min-w-60">{p ? `${p.code} - ${p.name}` : e.projectId}</span>
                <span className="text-xs font-bold text-gray-500">{taskLabelMap.get(e.taskType) || e.taskType}</span>
                <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={Math.floor(e.minutes / 60)}
                    onChange={(ev) => {
                      const h = Math.max(0, Number(ev.target.value) || 0);
                      const m = e.minutes % 60;
                      saveTimesheetEntry({ userId: e.userId, date: e.date, projectId: e.projectId, taskType: e.taskType, minutes: h * 60 + m });
                      setRefreshTick((v) => v + 1);
                      onUpdate();
                    }}
                    className="w-16 px-1 py-1 text-sm font-bold outline-none"
                  />
                  <span className="text-xs text-gray-500">ชั่วโมง</span>
                </div>
                <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={e.minutes % 60}
                    onChange={(ev) => {
                      const h = Math.floor(e.minutes / 60);
                      const m = Math.min(59, Math.max(0, Number(ev.target.value) || 0));
                      saveTimesheetEntry({ userId: e.userId, date: e.date, projectId: e.projectId, taskType: e.taskType, minutes: h * 60 + m });
                      setRefreshTick((v) => v + 1);
                      onUpdate();
                    }}
                    className="w-16 px-1 py-1 text-sm font-bold outline-none"
                  />
                  <span className="text-xs text-gray-500">นาที</span>
                </div>
              </div>
            );
          })}
          {selectedDateEntries.length === 0 && <p className="text-sm text-gray-400 italic">ยังไม่มีรายการในวันที่เลือก</p>}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-200 p-6">
        <h4 className="font-black mb-3">สรุปชั่วโมงตามโครงการของฉัน</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs text-gray-400"><th className="py-2">โครงการ</th><th className="py-2 text-right">ชั่วโมงรวม</th></tr></thead>
            <tbody>
              {projectSummary.map((r) => (
                <tr key={r.projectId} className="border-t">
                  <td className="py-2 text-sm font-bold">{r.projectName}</td>
                  <td className="py-2 text-right text-sm font-black">{(r.minutes / 60).toFixed(2)} ชม.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isManagerOrAdmin && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4">
          <h3 className="text-lg font-black">Calendar ชั่วโมงทำงานของพนักงานใต้สังกัด</h3>
          <select value={activeTeamUserId} onChange={(e) => setTeamUserId(e.target.value)} className="px-3 py-2 border rounded-xl text-sm font-bold min-w-72">
            {teamCandidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {monthCalendar.map((d) => {
              const iso = toIso(d);
              const total = teamDayMap.get(iso) ?? 0;
              const overtime = total > 8 * 60;
              const isCurrentMonth = d.getMonth() === selectedMonth.getMonth();
              return (
                <div key={`team-${iso}`} className={`min-h-20 rounded-xl border p-2 ${overtime ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-100'} ${!isCurrentMonth ? 'opacity-40' : ''}`}>
                  <div className="text-xs font-black">{d.getDate()}</div>
                  <div className={`text-[10px] font-bold mt-1 ${overtime ? 'text-rose-600' : 'text-gray-500'}`}>
                    {total > 0 ? hoursText(total) : '-'}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 font-medium">วันที่ทำงานเกิน 8 ชั่วโมงจะถูกไฮไลต์สีแดง</p>
        </div>
      )}
    </div>
  );
};

export default TimesheetModule;
