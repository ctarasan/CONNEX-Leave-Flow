import React, { useEffect, useMemo, useState } from 'react';
import { LeaveRequest, LeaveStatus, User, UserRole } from '../types';
import { approveExpenseClaim, getExpenseClaimById, getExpenseClaims, getExpenseTypes, rejectExpenseClaim } from '../api';
import { getAllUsers, getLeaveTypes, getTimesheetProjectsForUser, updateRequestStatus } from '../store';
import { formatBangkokDdMmBeTime, formatYmdAsDdMmBe } from '../utils';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { FIELD_MAX_LENGTHS, HOLIDAYS_2026 } from '../constants';

type TabKey = 'ALL' | 'LEAVE' | 'EXPENSE';

type PendingItem = {
  id: string;
  kind: 'LEAVE' | 'EXPENSE';
  requesterName: string;
  submittedAt?: string;
  title: string;
  subtitle: string;
  reason?: string;
  leaveRaw?: LeaveRequest;
  expenseRaw?: {
    id: string;
    requesterId: string;
    approverId?: string;
    requesterName: string;
    claimDate: string;
    submittedAt?: string;
    projectSummary?: string;
    detailSummary?: string;
    totalAmount: number;
    items?: Array<{
      expenseDate: string;
      projectId: string;
      expenseTypeId: string;
      detail: string;
      amount: number;
    }>;
  };
};

const normalizeId = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return String(parseInt(s, 10)).padStart(3, '0');
  return s;
};

const calculateBusinessDays = (startStr: string, endStr: string): number => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
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

interface PendingApprovalsBoardProps {
  leaveRequests: LeaveRequest[];
  currentUser: User;
  onUpdate: () => void;
}

const PendingApprovalsBoard: React.FC<PendingApprovalsBoardProps> = ({ leaveRequests, currentUser, onUpdate }) => {
  const [tab, setTab] = useState<TabKey>('ALL');
  const [search, setSearch] = useState('');
  const [expenseWaiting, setExpenseWaiting] = useState<PendingItem[]>([]);
  const [expenseTypeLabelMap, setExpenseTypeLabelMap] = useState<Record<string, string>>({});
  const [commentById, setCommentById] = useState<Record<string, string>>({});
  const { runAction, isActionBusy } = useAsyncAction();
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    const users = getAllUsers();
    for (const u of users) {
      const projects = getTimesheetProjectsForUser(u.id);
      for (const p of projects) {
        if (!map.has(p.id)) map.set(p.id, p.name || p.id);
      }
    }
    return map;
  }, [currentUser.id]);

  const loadExpenseWaiting = async () => {
    const scope = currentUser.role === UserRole.ADMIN ? 'all' : 'subordinates';
    const raw = await getExpenseClaims({ scope });
    const me = normalizeId(currentUser.id);

    const waitingBasics = raw
      .map((x) => ({
        id: String(x.id ?? ''),
        requesterId: String(x.requesterId ?? ''),
        approverId: x.approverId ? String(x.approverId) : undefined,
        requesterName: String(x.requesterName ?? ''),
        claimDate: String(x.claimDate ?? ''),
        submittedAt: x.submittedAt ? String(x.submittedAt) : undefined,
        projectSummary: x.projectSummary ? String(x.projectSummary) : '-',
        detailSummary: x.detailSummary ? String(x.detailSummary) : '-',
        totalAmount: Number(x.totalAmount ?? 0),
        status: String(x.status ?? ''),
      }))
      .filter((x) => x.status === 'WAITING')
      .filter((x) => normalizeId(x.requesterId) !== me)
      .filter((x) => {
        if (currentUser.role === UserRole.ADMIN) return normalizeId(x.approverId) === me;
        return true;
      })
      .map((x) => ({
        id: `EXP-${x.id}`,
        kind: 'EXPENSE' as const,
        requesterName: x.requesterName,
        submittedAt: x.submittedAt,
        title: `ขอเบิก ${x.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
        subtitle: `${formatYmdAsDdMmBe(x.claimDate)} • ${x.projectSummary || '-'} • ${x.detailSummary || '-'}`,
        reason: x.detailSummary || '',
        expenseRaw: {
          id: x.id,
          requesterId: x.requesterId,
          approverId: x.approverId,
          requesterName: x.requesterName,
          claimDate: x.claimDate,
          submittedAt: x.submittedAt,
          projectSummary: x.projectSummary,
          detailSummary: x.detailSummary,
          totalAmount: x.totalAmount,
        },
      }));

    const waiting: PendingItem[] = await Promise.all(
      waitingBasics.map(async (w) => {
        if (!w.expenseRaw) return w;
        try {
          const detail = await getExpenseClaimById(w.expenseRaw.id);
          const items = Array.isArray(detail.items) ? detail.items : [];
          return {
            ...w,
            expenseRaw: {
              ...w.expenseRaw,
              items: items.map((it) => ({
                expenseDate: String((it as Record<string, unknown>).expenseDate ?? ''),
                projectId: String((it as Record<string, unknown>).projectId ?? ''),
                expenseTypeId: String((it as Record<string, unknown>).expenseTypeId ?? ''),
                detail: String((it as Record<string, unknown>).detail ?? ''),
                amount: Number((it as Record<string, unknown>).amount ?? 0),
              })),
            },
          };
        } catch {
          return w;
        }
      })
    );

    setExpenseWaiting(waiting);
  };

  useEffect(() => {
    if (currentUser.role === UserRole.EMPLOYEE) return;
    getExpenseTypes()
      .then((rows) => {
        const map: Record<string, string> = {};
        for (const r of rows) map[String(r.id ?? '')] = String(r.label ?? '');
        setExpenseTypeLabelMap(map);
      })
      .catch(() => {});
    loadExpenseWaiting().catch(() => {
      setExpenseWaiting([]);
    });
  }, [currentUser.id, currentUser.role]);

  const leaveWaiting = useMemo<PendingItem[]>(() => {
    const typeMap = new Map(getLeaveTypes().map((x) => [x.id, x.label]));
    const me = normalizeId(currentUser.id);
    return leaveRequests
      .filter((r) => r.status === LeaveStatus.PENDING)
      .filter((r) => normalizeId(r.userId) !== me)
      .map((r) => {
        const days = calculateBusinessDays(r.startDate, r.endDate);
        return ({
        id: `LEAVE-${r.id}`,
        kind: 'LEAVE' as const,
        requesterName: r.userName,
        submittedAt: r.submittedAt,
        title: `${typeMap.get(r.type) ?? r.type} • ${days} วันทำการ`,
        subtitle: `${formatYmdAsDdMmBe(r.startDate)} ถึง ${formatYmdAsDdMmBe(r.endDate)}`,
        reason: r.reason,
        leaveRaw: r,
      });
      });
  }, [currentUser.id, leaveRequests]);

  const merged = useMemo(() => {
    const all = [...leaveWaiting, ...expenseWaiting];
    return all.sort((a, b) => String(b.submittedAt ?? '').localeCompare(String(a.submittedAt ?? '')));
  }, [expenseWaiting, leaveWaiting]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = merged;
    if (tab === 'LEAVE') list = list.filter((x) => x.kind === 'LEAVE');
    if (tab === 'EXPENSE') list = list.filter((x) => x.kind === 'EXPENSE');
    if (!q) return list;
    return list.filter((x) => x.requesterName.toLowerCase().includes(q) || x.title.toLowerCase().includes(q));
  }, [merged, search, tab]);

  const counts = useMemo(
    () => ({
      ALL: merged.length,
      LEAVE: leaveWaiting.length,
      EXPENSE: expenseWaiting.length,
    }),
    [expenseWaiting.length, leaveWaiting.length, merged.length]
  );

  const handleApprove = (item: PendingItem) => {
    runAction(`pending-approve-${item.id}`, async () => {
      if (item.kind === 'LEAVE' && item.leaveRaw) {
        await Promise.resolve(updateRequestStatus(item.leaveRaw.id, LeaveStatus.APPROVED, commentById[item.id] || '', currentUser.id));
      }
      if (item.kind === 'EXPENSE' && item.expenseRaw) {
        await approveExpenseClaim(item.expenseRaw.id);
      }
      onUpdate();
      await loadExpenseWaiting();
    });
  };

  const handleReject = (item: PendingItem) => {
    runAction(`pending-reject-${item.id}`, async () => {
      if (item.kind === 'LEAVE' && item.leaveRaw) {
        await Promise.resolve(updateRequestStatus(item.leaveRaw.id, LeaveStatus.REJECTED, commentById[item.id] || '', currentUser.id));
      }
      if (item.kind === 'EXPENSE' && item.expenseRaw) {
        const reason = (commentById[item.id] || '').trim() || window.prompt('ระบุเหตุผลการไม่อนุมัติ', '') || '';
        if (!reason.trim()) return;
        await rejectExpenseClaim(item.expenseRaw.id, reason.trim());
      }
      onUpdate();
      await loadExpenseWaiting();
    });
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-900">คำขอที่รอการอนุมัติ</h2>
        <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded-lg">{counts.ALL} รายการ</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { key: 'ALL' as const, label: 'ทั้งหมด', count: counts.ALL },
          { key: 'LEAVE' as const, label: 'ใบลา', count: counts.LEAVE },
          { key: 'EXPENSE' as const, label: 'ใบเบิก', count: counts.EXPENSE },
        ].map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(x.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${tab === x.key ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
          >
            {x.label} <span className="ml-1 text-[10px]">{x.count}</span>
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={FIELD_MAX_LENGTHS.searchText}
          placeholder="ค้นหาผู้ขอ..."
          className="ml-auto min-w-[220px] px-3 py-2 border rounded-lg text-xs font-bold"
        />
        <span className="text-[10px] text-gray-400">ค้นหา (Max Length = {FIELD_MAX_LENGTHS.searchText})</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
          <p className="text-gray-400 font-bold text-sm">ไม่มีคำขอที่ค้างอยู่</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <div key={item.id} className="p-5 border-2 border-gray-50 rounded-2xl hover:border-blue-100 transition bg-white shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-black text-gray-900 text-base">{item.requesterName}</h3>
                  <p className={`text-xs font-bold inline-block px-2 py-1 rounded-md mt-1 ${item.kind === 'LEAVE' ? 'text-blue-600 bg-blue-50' : 'text-violet-700 bg-violet-50'}`}>
                    {item.kind === 'LEAVE' ? 'ใบลา' : 'ใบเบิก'} • {item.title}
                  </p>
                  <p className="text-[11px] text-gray-600 font-medium mt-1">{item.subtitle}</p>
                  {item.submittedAt && <p className="text-[10px] text-gray-500 font-medium mt-1.5">ส่งเมื่อ: {formatBangkokDdMmBeTime(item.submittedAt)}</p>}
                </div>
              </div>
              {item.reason && (
                <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-700 italic mb-3 border border-gray-100">
                  <span className="text-gray-400 not-italic font-bold text-[10px] block mb-1 uppercase">{item.kind === 'LEAVE' ? 'เหตุผลการลา' : 'รายละเอียดใบเบิก'}:</span>
                  "{item.reason}"
                </div>
              )}
              {item.kind === 'EXPENSE' && item.expenseRaw?.items && item.expenseRaw.items.length > 0 && (
                <div className="mb-3 border rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase">
                        <tr>
                          <th className="px-2 py-2">วันที่รายการ</th>
                          <th className="px-2 py-2">ชื่อโครงการ</th>
                          <th className="px-2 py-2">ประเภทค่าใช้จ่าย</th>
                          <th className="px-2 py-2">รายละเอียด</th>
                          <th className="px-2 py-2 text-right">ยอดเบิก</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.expenseRaw.items.map((it, idx) => (
                          <tr key={`${item.id}-${idx}`} className="border-t">
                            <td className="px-2 py-2">{formatYmdAsDdMmBe(it.expenseDate)}</td>
                            <td className="px-2 py-2">{projectNameById.get(it.projectId) || it.projectId || '-'}</td>
                            <td className="px-2 py-2">{expenseTypeLabelMap[it.expenseTypeId] || it.expenseTypeId || '-'}</td>
                            <td className="px-2 py-2">{it.detail || '-'}</td>
                            <td className="px-2 py-2 text-right">
                              {Number(it.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  ความเห็นเพิ่มเติม (Max Length = {FIELD_MAX_LENGTHS.approvalComment})
                </label>
                <input
                  type="text"
                  placeholder="ใส่ความเห็นเพิ่มเติมเพื่อแจ้งพนักงาน..."
                  maxLength={FIELD_MAX_LENGTHS.approvalComment}
                  className="w-full p-3 text-sm bg-white border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 font-bold"
                  value={commentById[item.id] || ''}
                  onChange={(e) => setCommentById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApprove(item)}
                    disabled={isActionBusy(`pending-approve-${item.id}`) || isActionBusy(`pending-reject-${item.id}`)}
                    aria-busy={isActionBusy(`pending-approve-${item.id}`)}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-xl text-sm font-black hover:bg-emerald-700 transition shadow-lg shadow-emerald-100"
                  >
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => handleReject(item)}
                    disabled={isActionBusy(`pending-approve-${item.id}`) || isActionBusy(`pending-reject-${item.id}`)}
                    aria-busy={isActionBusy(`pending-reject-${item.id}`)}
                    className="flex-1 bg-rose-600 text-white py-3 rounded-xl text-sm font-black hover:bg-rose-700 transition shadow-lg shadow-rose-100"
                  >
                    ไม่อนุมัติ
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingApprovalsBoard;

