import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { User, UserRole } from '../types';
import { getAllUsers, getSubordinateIdsRecursive, getTimesheetEntries, getTimesheetProjects, getTimesheetTaskTypes } from '../store';

interface ProjectTimesheetReportProps {
  currentUser: User;
}

type TimeScope = 'today' | 'week' | 'month' | 'all';

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

const ProjectTimesheetReport: React.FC<ProjectTimesheetReportProps> = ({ currentUser }) => {
  const [pivotMode, setPivotMode] = useState<'task' | 'employee'>('task');
  const [performanceProjectId, setPerformanceProjectId] = useState('ALL');
  const [timeScope, setTimeScope] = useState<TimeScope>('all');
  const isManagerOrAdmin = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.ADMIN;

  const allUsers = useMemo(() => getAllUsers(), []);
  const allEntries = useMemo(() => getTimesheetEntries(), []);
  const allProjects = useMemo(() => getTimesheetProjects(), []);
  const taskTypes = useMemo(() => getTimesheetTaskTypes().filter((t) => t.isActive), []);

  const managerProjects = useMemo(() => {
    if (!isManagerOrAdmin) return [];
    if (currentUser.role === UserRole.ADMIN) {
      return allProjects.filter((p) => p.isActive);
    }
    const subordinateIds = getSubordinateIdsRecursive(currentUser.id, allUsers);
    const visibleManagerIds = new Set(
      [currentUser.id, ...subordinateIds]
        .map((id) => allUsers.find((u) => u.id === id))
        .filter((u): u is User => !!u && (u.role === UserRole.MANAGER || u.role === UserRole.ADMIN))
        .map((u) => u.id)
    );
    return allProjects.filter((p) => p.isActive && visibleManagerIds.has(p.projectManagerId));
  }, [allProjects, allUsers, currentUser.id, currentUser.role, isManagerOrAdmin]);

  const scopedEntries = useMemo(() => {
    const now = new Date();
    const todayIso = toIso(now);
    if (timeScope === 'all') return allEntries;
    if (timeScope === 'today') {
      return allEntries.filter((e) => e.date === todayIso);
    }
    if (timeScope === 'week') {
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return allEntries.filter((e) => {
        const d = new Date(`${e.date}T00:00:00`);
        return d >= weekStart && d <= weekEnd;
      });
    }
    const year = now.getFullYear();
    const month = now.getMonth();
    return allEntries.filter((e) => {
      const d = new Date(`${e.date}T00:00:00`);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [allEntries, timeScope]);

  const pivotRows = useMemo(() => {
    if (!isManagerOrAdmin) return [];
    const projectIds = new Set(managerProjects.map((p) => p.id));
    const filtered = scopedEntries.filter((e) => projectIds.has(e.projectId));
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
    }).filter((row) => managerProjects.some((p) => Number(row[p.id] ?? 0) > 0));
  }, [allUsers, isManagerOrAdmin, managerProjects, pivotMode, scopedEntries, taskTypes]);

  const performanceData = useMemo(() => {
    if (!isManagerOrAdmin) return [];
    const scopedProjects = performanceProjectId === 'ALL'
      ? managerProjects
      : managerProjects.filter((p) => p.id === performanceProjectId);

    return scopedProjects.map((project) => {
      const data = taskTypes.map((task) => {
        const targetDays = project.taskTargetDays[task.id] ?? 0;
        const actualDays = scopedEntries
          .filter((e) => e.projectId === project.id && (e.taskType === task.id || e.taskType === task.label))
          .reduce((s, e) => s + e.minutes, 0) / (8 * 60);
        return {
          task: task.label,
          targetDays: Number(targetDays.toFixed(2)),
          actualDays: Number(actualDays.toFixed(2)),
        };
      });
      return {
        projectId: project.id,
        projectName: `${project.code} - ${project.name}`,
        data,
      };
    });
  }, [isManagerOrAdmin, managerProjects, performanceProjectId, scopedEntries, taskTypes]);

  if (!isManagerOrAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black">สรุปชั่วโมงการทำงานของโครงการฯ</h3>
          <div className="flex flex-wrap gap-2 justify-end">
            <select
              value={timeScope}
              onChange={(e) => setTimeScope(e.target.value as TimeScope)}
              className="px-3 py-1.5 rounded-lg border text-xs font-black bg-white"
            >
              <option value="today">วันนี้</option>
              <option value="week">สัปดาห์นี้</option>
              <option value="month">เดือนนี้</option>
              <option value="all">ทั้งหมด</option>
            </select>
            <button onClick={() => setPivotMode('task')} className={`px-3 py-1 rounded-lg text-xs font-black ${pivotMode === 'task' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>ตาม Task</button>
            <button onClick={() => setPivotMode('employee')} className={`px-3 py-1 rounded-lg text-xs font-black ${pivotMode === 'employee' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>ตามพนักงาน</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="py-2">{pivotMode === 'task' ? 'ประเภทงาน' : 'พนักงาน'}</th>
                {managerProjects.map((p) => <th key={p.id} className="py-2 text-right">{p.name}</th>)}
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

      <div className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-black">Performance โครงการ (เปรียบเทียบ Target & Actual แยกตามประเภทงาน)</h3>
          <select
            value={performanceProjectId}
            onChange={(e) => setPerformanceProjectId(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm font-bold min-w-60"
          >
            <option value="ALL">ทุกโครงการที่มีสิทธิ์เห็น</option>
            {managerProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
            ))}
          </select>
        </div>
        {performanceData.length === 0 && (
          <p className="text-sm text-gray-400 italic">ยังไม่มีข้อมูลโครงการสำหรับแสดงกราฟ</p>
        )}
        {performanceData.map((chart) => (
          <div key={chart.projectId} className="border rounded-2xl p-3">
            {performanceProjectId === 'ALL' && (
              <p className="text-sm font-black text-gray-700 mb-2">{chart.projectName}</p>
            )}
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="task" />
                  <YAxis tickFormatter={(v) => `${v}`} label={{ value: 'วัน', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number | string, name: string) => [`${value} วัน`, name === 'targetDays' ? 'Target (วัน)' : 'Actual (วัน)']} />
                  <Legend />
                  <Bar dataKey="targetDays" fill="#6366f1" name="Target (วัน)" />
                  <Bar dataKey="actualDays" fill="#06b6d4" name="Actual (วัน)" minPointSize={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectTimesheetReport;
