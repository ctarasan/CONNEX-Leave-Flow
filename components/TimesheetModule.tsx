import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
  const [selectedDate, setSelectedDate] = useState<string>(toIso(new Date()));
  const [projectId, setProjectId] = useState('');
  const [taskType, setTaskType] = useState<string>('');
  const [hours, setHours] = useState(8);
  const [minutes, setMinutes] = useState(0);
  const [pivotMode, setPivotMode] = useState<'task' | 'employee'>('task');
  const [teamUserId, setTeamUserId] = useState('');

  const allUsers = useMemo(() => getAllUsers(), [onUpdate]);
  const allEntries = useMemo(() => getTimesheetEntries(), [onUpdate]);
  const allProjects = useMemo(() => getTimesheetProjects(), [onUpdate]);
  const taskTypes = useMemo(() => getTimesheetTaskTypes().filter((t) => t.isActive), [onUpdate]);
  const taskLabelMap = useMemo(() => new Map(taskTypes.map((t) => [t.id, t.label])), [taskTypes]);
  const userProjects = useMemo(() => getTimesheetProjectsForUser(currentUser.id), [currentUser.id, onUpdate]);
  const normalizedTaskType = taskType || taskTypes[0]?.id || '';
  const selectedDateEntries = useMemo(() => getTimesheetEntriesByDate(currentUser.id, selectedDate), [currentUser.id, selectedDate, onUpdate]);
  const selectedMonth = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);
  const isManagerOrAdmin = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.ADMIN;

  const myEntries = useMemo(() => getTimesheetEntries(currentUser.id), [currentUser.id, onUpdate]);

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

  const managerProjects = useMemo(() => {
    if (!isManagerOrAdmin) return [];
    return allProjects.filter((p) => p.isActive && p.projectManagerId === currentUser.id);
  }, [allProjects, currentUser.id, isManagerOrAdmin]);

  const pivotRows = useMemo(() => {
    if (!isManagerOrAdmin) return [];
    const projectIds = new Set(managerProjects.map((p) => p.id));
    const filtered = allEntries.filter((e) => projectIds.has(e.projectId));
    if (pivotMode === 'task') {
      return taskTypes.map((task) => {
        const row: Record<string, string | number> = { label: task.label };
        for (const p of managerProjects) {
          const mins = filtered.filter((e) => e.projectId === p.id && (e.taskType === task.id || e.taskType === task.label)).reduce((s, e) => s + e.minutes, 0);
          row[p.id] = Number((mins / 60).toFixed(2));
        }
        return row;
      });
    }
    const involved = allUsers.filter((u) => managerProjects.some((p) => p.assignedUserIds.includes(u.id)));
    return involved.map((u) => {
      const row: Record<string, string | number> = { label: u.name };
      for (const p of managerProjects) {
        const mins = filtered.filter((e) => e.projectId === p.id && e.userId === u.id).reduce((s, e) => s + e.minutes, 0);
        row[p.id] = Number((mins / 60).toFixed(2));
      }
      return row;
    });
  }, [allEntries, allUsers, isManagerOrAdmin, managerProjects, pivotMode, taskTypes]);

  const performanceData = useMemo(() => {
    if (!isManagerOrAdmin) return [];
    return managerProjects.map((p) => {
      const targetHours = Object.values(p.taskTargetDays).reduce((s, d) => s + d * 8, 0);
      const actualHours = allEntries
        .filter((e) => e.projectId === p.id)
        .reduce((s, e) => s + e.minutes, 0) / 60;
      return {
        project: p.code,
        target: Number(targetHours.toFixed(2)),
        actual: Number(actualHours.toFixed(2)),
      };
    });
  }, [allEntries, isManagerOrAdmin, managerProjects]);

  const teamCandidates = useMemo(() => {
    if (currentUser.role === UserRole.ADMIN) return allUsers.filter((u) => u.id !== currentUser.id);
    if (currentUser.role === UserRole.MANAGER) {
      const ids = getSubordinateIdsRecursive(currentUser.id, allUsers);
      return allUsers.filter((u) => ids.includes(u.id));
    }
    return [];
  }, [allUsers, currentUser.id, currentUser.role]);

  const activeTeamUserId = teamUserId || teamCandidates[0]?.id || '';
  const teamEntries = useMemo(() => (activeTeamUserId ? getTimesheetEntries(activeTeamUserId) : []), [activeTeamUserId, onUpdate]);
  const teamDayMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of teamEntries) map.set(e.date, (map.get(e.date) ?? 0) + e.minutes);
    return map;
  }, [teamEntries]);

  const saveEntry = () => {
    if (!projectId) return;
    saveTimesheetEntry({
      userId: currentUser.id,
      date: selectedDate,
      projectId,
      taskType: normalizedTaskType,
      minutes: Math.max(0, hours * 60 + minutes),
    });
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-lg font-black text-gray-900">Timesheet Calendar</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-3 py-2 border rounded-xl text-sm font-bold" />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 border rounded-xl text-sm font-bold min-w-60">
            <option value="">เลือกโครงการที่ได้รับมอบหมาย</option>
            {userProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
            ))}
          </select>
          <select value={normalizedTaskType} onChange={(e) => setTaskType(e.target.value)} className="px-3 py-2 border rounded-xl text-sm font-bold">
            {taskTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value) || 0)} className="w-24 px-3 py-2 border rounded-xl text-sm font-bold" />
          <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} className="w-24 px-3 py-2 border rounded-xl text-sm font-bold" />
          <button onClick={saveEntry} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-black">บันทึก Timesheet</button>
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
                onClick={() => setSelectedDate(iso)}
                className={`min-h-20 rounded-xl border p-2 text-left transition ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white hover:border-blue-200'
                } ${!isCurrentMonth ? 'opacity-40' : ''}`}
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
        <h4 className="font-black mb-3">รายการของวันที่เลือก</h4>
        <div className="space-y-2">
          {selectedDateEntries.map((e) => {
            const p = allProjects.find((x) => x.id === e.projectId);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 border rounded-xl p-3">
                <span className="text-sm font-bold min-w-60">{p ? `${p.code} - ${p.name}` : e.projectId}</span>
                <span className="text-xs font-bold text-gray-500">{taskLabelMap.get(e.taskType) || e.taskType}</span>
                <input
                  type="number"
                  min={0}
                  max={24 * 60}
                  value={e.minutes}
                  onChange={(ev) => {
                    saveTimesheetEntry({ userId: e.userId, date: e.date, projectId: e.projectId, taskType: e.taskType, minutes: Number(ev.target.value) || 0 });
                    onUpdate();
                  }}
                  className="w-28 px-2 py-1 border rounded-lg text-sm font-bold"
                />
                <span className="text-xs text-gray-500">นาที</span>
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
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black">Pivot สรุปชั่วโมงโครงการ (เฉพาะที่เป็น PM)</h3>
            <div className="flex gap-2">
              <button onClick={() => setPivotMode('task')} className={`px-3 py-1 rounded-lg text-xs font-black ${pivotMode === 'task' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>ตาม Task</button>
              <button onClick={() => setPivotMode('employee')} className={`px-3 py-1 rounded-lg text-xs font-black ${pivotMode === 'employee' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>ตามพนักงาน</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="py-2">{pivotMode === 'task' ? 'ประเภทงาน' : 'พนักงาน'}</th>
                  {managerProjects.map((p) => <th key={p.id} className="py-2 text-right">{p.code}</th>)}
                </tr>
              </thead>
              <tbody>
                {pivotRows.map((row, i) => (
                  <tr key={`${row.label}-${i}`} className="border-t">
                    <td className="py-2 text-sm font-bold">{String(row.label)}</td>
                    {managerProjects.map((p) => (
                      <td key={p.id} className="py-2 text-right text-sm font-black">{Number(row[p.id] ?? 0).toFixed(2)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isManagerOrAdmin && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4">
          <h3 className="text-lg font-black">Performance โครงการ (Target vs Actual Hours)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="project" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="target" fill="#6366f1" name="Target ชั่วโมง" />
                <Bar dataKey="actual" fill="#06b6d4" name="Actual ชั่วโมง" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
