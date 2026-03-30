import React, { useEffect, useMemo, useState } from 'react';
import { ExpenseClaim, ExpenseClaimItem, ExpenseTypeDefinition, User, UserRole } from '../types';
import {
  approveExpenseClaim,
  getExpenseClaimById,
  getExpenseClaims,
  getExpenseTypes,
  postExpenseClaim,
  rejectExpenseClaim,
  submitExpenseClaim,
  setExpenseClaimPayDate,
} from '../api';
import { getAllUsers, getTimesheetProjectsForUser } from '../store';
import DatePicker from './DatePicker';
import { formatYmdAsDdMmBe } from '../utils';

type RangePreset = 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';
const normalizeId = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return String(parseInt(s, 10)).padStart(3, '0');
  return s;
};

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toInputDate(value: string): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toYmd(d);
  return '';
}
function rangeFromPreset(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  const today = toYmd(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'thisWeek') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    return { from: toYmd(start), to: today };
  }
  if (preset === 'lastMonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toYmd(first), to: toYmd(last) };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toYmd(first), to: today };
}
function parseExpenseTypes(raw: Record<string, unknown>[]): ExpenseTypeDefinition[] {
  return raw.map((x) => ({
    id: String(x.id ?? ''),
    label: String(x.label ?? ''),
    isActive: x.isActive !== false,
    createdAt: String(x.createdAt ?? ''),
    updatedAt: String(x.updatedAt ?? ''),
  }));
}
function parseClaims(raw: Record<string, unknown>[]): ExpenseClaim[] {
  return raw.map((x) => ({
    id: String(x.id ?? ''),
    requesterId: String(x.requesterId ?? ''),
    requesterName: String(x.requesterName ?? ''),
    approverId: x.approverId ? String(x.approverId) : undefined,
    approverName: x.approverName ? String(x.approverName) : undefined,
    status: String(x.status ?? 'DRAFT') as ExpenseClaim['status'],
    claimDate: String(x.claimDate ?? ''),
    submittedAt: x.submittedAt ? String(x.submittedAt) : undefined,
    approvedAt: x.approvedAt ? String(x.approvedAt) : undefined,
    rejectedAt: x.rejectedAt ? String(x.rejectedAt) : undefined,
    rejectReason: x.rejectReason ? String(x.rejectReason) : undefined,
    paidDate: x.paidDate ? String(x.paidDate) : undefined,
    adminNote: x.adminNote ? String(x.adminNote) : undefined,
    projectSummary: x.projectSummary ? String(x.projectSummary) : '-',
    detailSummary: x.detailSummary ? String(x.detailSummary) : '-',
    totalAmount: Number(x.totalAmount ?? 0),
    createdAt: String(x.createdAt ?? ''),
    updatedAt: String(x.updatedAt ?? ''),
    items: [],
  }));
}
function parseClaimDetail(raw: Record<string, unknown>): ExpenseClaim {
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw.map((it) => ({
    id: String((it as Record<string, unknown>).id ?? ''),
    expenseDate: String((it as Record<string, unknown>).expenseDate ?? ''),
    projectId: String((it as Record<string, unknown>).projectId ?? ''),
    expenseTypeId: String((it as Record<string, unknown>).expenseTypeId ?? ''),
    detail: String((it as Record<string, unknown>).detail ?? ''),
    amount: Number((it as Record<string, unknown>).amount ?? 0),
  }));
  return {
    id: String(raw.id ?? ''),
    requesterId: String(raw.requesterId ?? ''),
    requesterName: String(raw.requesterName ?? ''),
    approverId: raw.approverId ? String(raw.approverId) : undefined,
    approverName: raw.approverName ? String(raw.approverName) : undefined,
    status: String(raw.status ?? 'DRAFT') as ExpenseClaim['status'],
    claimDate: String(raw.claimDate ?? ''),
    submittedAt: raw.submittedAt ? String(raw.submittedAt) : undefined,
    approvedAt: raw.approvedAt ? String(raw.approvedAt) : undefined,
    rejectedAt: raw.rejectedAt ? String(raw.rejectedAt) : undefined,
    rejectReason: raw.rejectReason ? String(raw.rejectReason) : undefined,
    paidDate: raw.paidDate ? String(raw.paidDate) : undefined,
    adminNote: raw.adminNote ? String(raw.adminNote) : undefined,
    totalAmount: Number(raw.totalAmount ?? 0),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
    items,
  };
}

const ExpenseModule: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [expenseTypes, setExpenseTypes] = useState<ExpenseTypeDefinition[]>([]);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [scope, setScope] = useState<'mine' | 'subordinates' | 'all'>(
    currentUser.role === UserRole.ADMIN ? 'all' : currentUser.role === UserRole.MANAGER ? 'subordinates' : 'mine'
  );
  const [preset, setPreset] = useState<RangePreset>('thisMonth');
  const initRange = rangeFromPreset('thisMonth');
  const [fromDate, setFromDate] = useState(initRange.from);
  const [toDate, setToDate] = useState(initRange.to);
  const [claimId, setClaimId] = useState('');
  const [claimDate, setClaimDate] = useState(toYmd(new Date()));
  const [items, setItems] = useState<ExpenseClaimItem[]>([
    { id: `tmp-${Date.now()}`, expenseDate: toYmd(new Date()), projectId: '', expenseTypeId: '', detail: '', amount: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ExpenseClaim | null>(null);
  const [payDate, setPayDate] = useState(toYmd(new Date()));
  const myProjects = getTimesheetProjectsForUser(currentUser.id);
  const canUseScopeFilter = useMemo(() => {
    if (currentUser.role === UserRole.ADMIN) return true;
    const me = normalizeId(currentUser.id);
    return getAllUsers().some((u) => normalizeId(u.managerId) === me && normalizeId(u.id) !== me);
  }, [currentUser.id, currentUser.role]);

  const activeExpenseTypes = useMemo(() => expenseTypes.filter((t) => t.isActive), [expenseTypes]);
  const claimTotal = useMemo(() => items.reduce((s, it) => s + (Number(it.amount) || 0), 0), [items]);

  const statusLabel = (c: ExpenseClaim) => {
    if (c.status === 'PAID' && c.paidDate) return `Approved (${formatYmdAsDdMmBe(c.paidDate)})`;
    if (c.status === 'APPROVED') return 'Approved';
    if (c.status === 'WAITING') return 'Waiting';
    if (c.status === 'DRAFT') return 'Save';
    if (c.status === 'REJECTED') return 'Rejected';
    return c.status;
  };

  const loadTypes = async () => {
    const raw = await getExpenseTypes();
    setExpenseTypes(parseExpenseTypes(raw));
  };
  const loadClaims = async () => {
    const raw = await getExpenseClaims({ from: fromDate, to: toDate, scope });
    const parsed = parseClaims(raw);
    const me = normalizeId(currentUser.id);
    const mergedById = new Map<string, ExpenseClaim>(parsed.map((c) => [c.id, c]));

    // บังคับให้เจ้าของรายการเห็นเอกสารที่ถูก Reject เสมอ เพื่อแก้ไขและ Submit ใหม่ได้
    if (currentUser.role !== UserRole.ADMIN) {
      const mineRaw = await getExpenseClaims({ scope: 'mine' });
      const mineRejected = parseClaims(mineRaw).filter(
        (c) => c.status === 'REJECTED' && normalizeId(c.requesterId) === me
      );
      for (const c of mineRejected) mergedById.set(c.id, c);
    }
    const merged = Array.from(mergedById.values());
    if (currentUser.role === UserRole.MANAGER && scope === 'subordinates') {
      // Manager board: ซ่อนรายการที่ Reject แล้วสำหรับ "ลูกทีม"
      // แต่ต้องยังเห็นรายการของตัวเองที่ถูก Reject เพื่อแก้ไขและ Submit ใหม่ได้
      setClaims(merged.filter((c) => c.status !== 'REJECTED' || normalizeId(c.requesterId) === me));
      return;
    }
    setClaims(merged);
  };
  useEffect(() => {
    loadTypes().catch(() => {});
  }, []);
  useEffect(() => {
    loadClaims().catch(() => {});
  }, [fromDate, toDate, scope]);
  useEffect(() => {
    if (!canUseScopeFilter && scope !== 'mine') {
      setScope('mine');
    }
  }, [canUseScopeFilter, scope]);

  const onPresetChange = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') {
      const next = rangeFromPreset(p);
      setFromDate(next.from);
      setToDate(next.to);
    }
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: `tmp-${Date.now()}-${prev.length}`, expenseDate: claimDate, projectId: '', expenseTypeId: '', detail: '', amount: 0 }]);
  };
  const updateItem = (id: string, patch: Partial<ExpenseClaimItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeItem = (id: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.id !== id)));
  };

  const saveClaim = async (submit: boolean) => {
    if (!claimDate) return alert('กรุณาระบุวันที่ทำรายการเบิก');
    if (items.some((it) => !it.expenseDate || !it.expenseTypeId || Number(it.amount) <= 0)) {
      return alert('กรุณากรอกข้อมูลรายการค่าใช้จ่ายให้ครบถ้วน และยอดเงินมากกว่า 0');
    }
    setLoading(true);
    try {
      const resp = await postExpenseClaim({
        id: claimId || undefined,
        requesterId: currentUser.id,
        claimDate,
        status: submit ? 'WAITING' : 'DRAFT',
        items: items.map((it) => ({
          id: it.id.startsWith('tmp-') ? undefined : it.id,
          expenseDate: it.expenseDate,
          projectId: it.projectId || null,
          expenseTypeId: it.expenseTypeId,
          detail: it.detail,
          amount: Number(it.amount) || 0,
        })),
      });
      const savedId = String(resp.id ?? claimId ?? '');
      await loadClaims();
      // Save/Submit เสร็จแล้วเคลียร์ฟอร์ม เพื่อให้สร้างได้หลายใบต่อเนื่อง
      setClaimId('');
      setClaimDate(toYmd(new Date()));
      setItems([{ id: `tmp-${Date.now()}`, expenseDate: toYmd(new Date()), projectId: '', expenseTypeId: '', detail: '', amount: 0 }]);
      alert(submit ? 'ส่งใบเบิกเพื่อขออนุมัติแล้ว' : 'บันทึกใบเบิก (Save) เรียบร้อย');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'บันทึกใบเบิกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const editClaim = async (id: string) => {
    try {
      const raw = await getExpenseClaimById(id);
      const c = parseClaimDetail(raw);
      if (normalizeId(c.requesterId) !== normalizeId(currentUser.id)) {
        alert('คุณไม่มีสิทธิ์แก้ไขรายการนี้');
        return;
      }
      if (!(c.status === 'DRAFT' || c.status === 'REJECTED')) {
        alert('แก้ไขได้เฉพาะรายการที่เป็น Save หรือ Rejected เท่านั้น');
        return;
      }
      const normalizedClaimDate = toInputDate(c.claimDate) || toYmd(new Date());
      setClaimId(c.id);
      setClaimDate(normalizedClaimDate);
      setItems(
        c.items.length > 0
          ? c.items.map((it) => ({
              id: it.id || `tmp-${Date.now()}`,
              expenseDate: toInputDate(it.expenseDate) || normalizedClaimDate,
              projectId: it.projectId || '',
              expenseTypeId: it.expenseTypeId || '',
              detail: it.detail || '',
              amount: Number(it.amount) || 0,
            }))
          : [{ id: `tmp-${Date.now()}`, expenseDate: normalizedClaimDate, projectId: '', expenseTypeId: '', detail: '', amount: 0 }]
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลเพื่อแก้ไขได้');
    }
  };

  const openDetail = async (id: string) => {
    try {
      const raw = await getExpenseClaimById(id);
      setDetail(parseClaimDetail(raw));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'โหลดรายละเอียดไม่สำเร็จ');
    }
  };

  const canReview = (c: ExpenseClaim) => {
    const status = String(c.status ?? '').trim().toUpperCase();
    if (status !== 'WAITING') return false;
    const me = normalizeId(currentUser.id);
    const requester = normalizeId(c.requesterId);
    const approver = normalizeId(c.approverId ?? '');
    // ห้ามอนุมัติ/ปฏิเสธรายการของตัวเอง
    if (requester === me) return false;
    if (currentUser.role === UserRole.MANAGER) {
      // ใช้ logic เดียวกับใบลา: ผู้จัดการเห็นรายการรออนุมัติของลูกทีมในมุม "ของผู้ใต้บังคับบัญชา"
      if (scope === 'subordinates') return true;
      // fallback สำหรับมุมอื่น
      if (!approver) return false;
      return approver === me;
    }
    if (currentUser.role === UserRole.ADMIN) {
      return approver === me;
    }
    return false;
  };

  const handleExportCsv = () => {
    if (claims.length === 0) {
      alert('ไม่พบข้อมูลสำหรับ Export');
      return;
    }
    const rows = [
      ['เลขที่ใบเบิก', 'ผู้ขอเบิก', 'วันที่ทำรายการ', 'ยอดรวม(บาท)', 'สถานะ', 'ผู้อนุมัติ'],
      ...claims.map((c) => [
        c.id,
        c.requesterName,
        formatYmdAsDdMmBe(c.claimDate),
        String(Number(c.totalAmount || 0).toFixed(2)),
        statusLabel(c),
        c.approverName || '',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-sheet {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
        }
      `}</style>
      <div className="bg-white border border-gray-200 rounded-2xl p-5 no-print">
        <h3 className="font-black text-gray-900 mb-3">สร้างใบเบิกค่าใช้จ่ายทั่วไป</h3>
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <label className="text-xs font-bold text-gray-600">เลขใบเบิก
            <input
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              placeholder="สร้างใหม่อัตโนมัติ"
              disabled={Boolean(claimId)}
              className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${claimId ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
            />
          </label>
          <label className="text-xs font-bold text-gray-600">ชื่อพนักงานผู้ขอเบิก
            <input value={currentUser.name} disabled className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
          </label>
          <div className="text-xs font-bold text-gray-600">
            <DatePicker label="วันที่ทำรายการเบิก" value={claimDate} onChange={setClaimDate} size="compact" />
          </div>
        </div>

        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 font-bold">
              <tr>
                <th className="px-3 py-2">วันที่</th>
                <th className="px-3 py-2">โครงการ</th>
                <th className="px-3 py-2">ประเภทค่าใช้จ่าย</th>
                <th className="px-3 py-2">รายละเอียด</th>
                <th className="px-3 py-2 text-right">ยอดเงิน</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2 min-w-[130px]"><DatePicker label="" value={it.expenseDate} onChange={(v) => updateItem(it.id, { expenseDate: v })} size="compact" /></td>
                  <td className="px-3 py-2">
                    <select value={it.projectId} onChange={(e) => updateItem(it.id, { projectId: e.target.value })} className="w-full border rounded px-2 py-1">
                      <option value="">ไม่ระบุโครงการ</option>
                      {myProjects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select value={it.expenseTypeId} onChange={(e) => updateItem(it.id, { expenseTypeId: e.target.value })} className="w-full border rounded px-2 py-1">
                      <option value="">เลือกประเภท</option>
                      {activeExpenseTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input value={it.detail} onChange={(e) => updateItem(it.id, { detail: e.target.value })} className="w-full border rounded px-2 py-1" /></td>
                  <td className="px-3 py-2"><input type="number" min={0} value={it.amount} onChange={(e) => updateItem(it.id, { amount: Number(e.target.value || 0) })} className="w-full border rounded px-2 py-1 text-right" /></td>
                  <td className="px-3 py-2"><button onClick={() => removeItem(it.id)} className="text-xs text-red-600 font-bold">ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3">
          <button onClick={addItem} className="px-3 py-2 rounded-lg bg-gray-100 text-xs font-bold">+ เพิ่มรายการ</button>
          <div className="text-sm font-black text-gray-800">รวมทั้งสิ้น {claimTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</div>
        </div>
        <div className="mt-4 flex gap-2">
          <button disabled={loading} onClick={() => saveClaim(false)} className="px-4 py-2 rounded-lg bg-gray-800 text-white text-xs font-bold">Save</button>
          {claimId && (
            <button
              type="button"
              onClick={() => {
                setClaimId('');
                setClaimDate(toYmd(new Date()));
                setItems([{ id: `tmp-${Date.now()}`, expenseDate: toYmd(new Date()), projectId: '', expenseTypeId: '', detail: '', amount: 0 }]);
              }}
              className="px-4 py-2 rounded-lg bg-gray-100 text-xs font-bold"
            >
              ยกเลิกการแก้ไข
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <h3 className="font-black text-gray-900 mr-4">ติดตามสถานะ / รายงานการเบิก</h3>
          <select value={preset} onChange={(e) => onPresetChange(e.target.value as RangePreset)} className="border rounded-lg px-2 py-1 text-xs font-bold">
            <option value="today">วันนี้</option>
            <option value="thisWeek">สัปดาห์นี้</option>
            <option value="thisMonth">เดือนนี้</option>
            <option value="lastMonth">เดือนที่แล้ว</option>
            <option value="custom">กำหนดช่วงเอง</option>
          </select>
          <div className="min-w-[130px]"><DatePicker label="" value={fromDate} onChange={(v) => { setPreset('custom'); setFromDate(v); }} size="compact" /></div>
          <div className="min-w-[130px]"><DatePicker label="" value={toDate} onChange={(v) => { setPreset('custom'); setToDate(v); }} size="compact" /></div>
          {canUseScopeFilter && (
            <select value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'subordinates' | 'all')} className="border rounded-lg px-2 py-1 text-xs font-bold">
              <option value="mine">ของฉัน</option>
              {currentUser.role !== UserRole.EMPLOYEE && <option value="subordinates">ของผู้ใต้บังคับบัญชา</option>}
              {currentUser.role === UserRole.ADMIN && <option value="all">ทั้งหมด</option>}
            </select>
          )}
          <button onClick={handleExportCsv} className="border rounded-lg px-3 py-1 text-xs font-bold text-blue-700 border-blue-200 bg-blue-50">Export CSV</button>
        </div>
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 font-bold">
              <tr>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">ผู้ขอเบิก</th>
                <th className="px-3 py-2">วันที่</th>
                <th className="px-3 py-2">ชื่อโครงการ</th>
                <th className="px-3 py-2">รายละเอียดที่เบิก</th>
                <th className="px-3 py-2 text-right">ยอดรวม</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-bold">{c.id}</td>
                  <td className="px-3 py-2">{c.requesterName}</td>
                  <td className="px-3 py-2">{formatYmdAsDdMmBe(c.claimDate)}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate" title={c.projectSummary || '-'}>{c.projectSummary || '-'}</td>
                  <td className="px-3 py-2 max-w-[260px] truncate" title={c.detailSummary || '-'}>{c.detailSummary || '-'}</td>
                  <td className="px-3 py-2 text-right">{Number(c.totalAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2"><span className="text-xs font-bold">{statusLabel(c)}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openDetail(c.id)} className="text-xs font-bold text-blue-600">ดู/พิมพ์</button>
                      {(c.status === 'DRAFT' || c.status === 'REJECTED') && normalizeId(c.requesterId) === normalizeId(currentUser.id) && (
                        <button
                          onClick={() => editClaim(c.id)}
                          className="text-xs font-bold text-amber-600"
                        >
                          แก้ไข
                        </button>
                      )}
                      {(c.status === 'DRAFT' || c.status === 'REJECTED') && normalizeId(c.requesterId) === normalizeId(currentUser.id) && (
                        <button
                          onClick={async () => {
                            try {
                              await submitExpenseClaim(c.id);
                              await loadClaims();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'ไม่สามารถ Submit ใบเบิกได้');
                            }
                          }}
                          className="text-xs font-bold text-indigo-600"
                        >
                          Submit
                        </button>
                      )}
                      {canReview(c) && <button onClick={async () => { try { await approveExpenseClaim(c.id); await loadClaims(); } catch (err) { alert(err instanceof Error ? err.message : 'ไม่สามารถอนุมัติได้'); } }} className="text-xs font-bold text-emerald-600">อนุมัติ</button>}
                      {canReview(c) && (
                        <button
                          onClick={async () => {
                            const reason = window.prompt('ระบุเหตุผลการไม่อนุมัติ', c.rejectReason || '');
                            if (!reason || !reason.trim()) return;
                            try {
                              await rejectExpenseClaim(c.id, reason.trim());
                              await loadClaims();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'ไม่สามารถ Reject ได้');
                            }
                          }}
                          className="text-xs font-bold text-rose-600"
                        >
                          Reject
                        </button>
                      )}
                      {currentUser.role === UserRole.ADMIN && (c.status === 'APPROVED' || c.status === 'PAID') && (
                        <button
                          onClick={async () => {
                            const value = prompt('ระบุวันทำจ่าย (YYYY-MM-DD)', payDate);
                            if (!value) return;
                            setPayDate(value);
                            await setExpenseClaimPayDate(c.id, value);
                            await loadClaims();
                          }}
                          className="text-xs font-bold text-violet-600"
                        >
                          กำหนดวันทำจ่าย
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr><td colSpan={8} className="text-center py-6 text-sm text-gray-400">ไม่พบข้อมูลรายการเบิกในช่วงเวลาที่เลือก</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 print-sheet">
          <div className="flex items-start justify-between no-print">
            <div>
              <h3 className="font-black text-gray-900">เอกสารใบเบิก #{detail.id}</h3>
              <p className="text-xs text-gray-600">ผู้ขอเบิก: {detail.requesterName} | วันที่: {formatYmdAsDdMmBe(detail.claimDate)} | สถานะ: {statusLabel(detail)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold">พิมพ์เอกสาร</button>
              <button onClick={() => setDetail(null)} className="px-3 py-2 rounded-lg bg-gray-100 text-xs font-bold">ปิด</button>
            </div>
          </div>
          <div className="mt-3 border rounded-xl overflow-x-auto p-4">
            <div className="text-center border-b pb-3 mb-3">
              <img src="/connex-logo.png" alt="CONNEX" className="h-8 mx-auto mb-2 object-contain" />
              <h2 className="text-lg font-black">แบบฟอร์มใบเบิกค่าใช้จ่ายทั่วไป</h2>
              <p className="text-sm font-bold">บริษัท คอนเนค บิสสิเนส ออนไลน์ จำกัด (CONNEX Business Online Co., Ltd.)</p>
              <p className="text-xs text-gray-600 mt-1">เลขที่เอกสาร: {detail.id} | วันที่ทำรายการ: {formatYmdAsDdMmBe(detail.claimDate)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div><span className="font-bold">ผู้ขอเบิก:</span> {detail.requesterName}</div>
              <div><span className="font-bold">ผู้อนุมัติ:</span> {detail.approverName || '-'}</div>
              <div><span className="font-bold">สถานะ:</span> {statusLabel(detail)}</div>
              <div><span className="font-bold">วันทำจ่าย:</span> {detail.paidDate ? formatYmdAsDdMmBe(detail.paidDate) : '-'}</div>
            </div>
            <table className="w-full text-sm border">
              <thead className="bg-gray-50 text-xs font-bold text-gray-600 border-b">
                <tr>
                  <th className="px-3 py-2 text-left border-r">วันที่</th>
                  <th className="px-3 py-2 text-left border-r">โครงการ</th>
                  <th className="px-3 py-2 text-left border-r">ประเภท</th>
                  <th className="px-3 py-2 text-left border-r">รายละเอียด</th>
                  <th className="px-3 py-2 text-right">ยอดเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-3 py-2 border-r">{formatYmdAsDdMmBe(it.expenseDate)}</td>
                    <td className="px-3 py-2 border-r">{it.projectId || '-'}</td>
                    <td className="px-3 py-2 border-r">{expenseTypes.find((t) => t.id === it.expenseTypeId)?.label ?? it.expenseTypeId}</td>
                    <td className="px-3 py-2 border-r">{it.detail}</td>
                    <td className="px-3 py-2 text-right">{Number(it.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="border-t bg-gray-50">
                  <td colSpan={4} className="px-3 py-2 text-right font-black">รวมเป็นเงินทั้งสิ้น</td>
                  <td className="px-3 py-2 text-right font-black">{Number(detail.totalAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            {detail.status === 'REJECTED' && detail.rejectReason && (
              <div className="mt-3 p-3 border border-rose-200 bg-rose-50 rounded text-sm">
                <span className="font-black text-rose-700">เหตุผลการไม่อนุมัติ:</span> {detail.rejectReason}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-sm">
              <div className="border rounded-lg p-3 min-h-[100px]">
                <p className="font-bold mb-10">ผู้ขอเบิก</p>
                <p>ลงชื่อ ....................................................</p>
                <p>วันที่ ....................................................</p>
              </div>
              <div className="border rounded-lg p-3 min-h-[100px]">
                <p className="font-bold mb-10">ผู้อนุมัติ</p>
                <p>ลงชื่อ ....................................................</p>
                <p>วันที่ ....................................................</p>
              </div>
              <div className="border rounded-lg p-3 min-h-[100px]">
                <p className="font-bold mb-10">การเงิน/บัญชี</p>
                <p>ลงชื่อ ....................................................</p>
                <p>วันที่ ....................................................</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseModule;
