import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const normIdSql = (col: string): string =>
  `(CASE
     WHEN TRIM(COALESCE((${col})::text, '')) ~ '^[0-9]+$'
       THEN LPAD(((TRIM(((${col})::text)))::int)::text, 3, '0')
     ELSE TRIM(COALESCE((${col})::text, ''))
   END)`;

function normalizeUserId(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return String(parseInt(s, 10)).padStart(3, '0');
  return s;
}

function normalizeRole(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

async function generateMonthlyClaimId(claimDate: string): Promise<string> {
  const d = new Date(claimDate);
  if (Number.isNaN(d.getTime())) {
    return randomId('EC');
  }
  const buddhistYear = d.getFullYear() + 543;
  const yymm = `${String(buddhistYear).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  await pool.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [yymm]);
  const { rows } = await pool.query<{ last_no: number }>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 6) AS INTEGER)), 0) AS last_no
     FROM expense_claims
     WHERE id LIKE $1
       AND id ~ $2`,
    [`${yymm}-%`, `^${yymm}-[0-9]{5}$`]
  );
  const next = Number(rows[0]?.last_no ?? 0) + 1;
  return `${yymm}-${String(next).padStart(5, '0')}`;
}

async function getUserRoleByNormalizedId(userId: string): Promise<string> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE ${normIdSql('id')} = $1 LIMIT 1`,
    [normalizeUserId(userId)]
  );
  return normalizeRole(rows[0]?.role ?? 'EMPLOYEE');
}

async function getApproverId(requesterId: string): Promise<string | null> {
  const { rows } = await pool.query<{ manager_id: string | null; role: string }>(
    `SELECT manager_id, role FROM users WHERE ${normIdSql('id')} = $1 LIMIT 1`,
    [normalizeUserId(requesterId)]
  );
  const row = rows[0];
  if (!row) return null;
  if (normalizeRole(row.role) === 'MANAGER') {
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id ASC LIMIT 1`
    );
    return admin.rows[0]?.id ? normalizeUserId(admin.rows[0].id) : null;
  }
  return row.manager_id ? normalizeUserId(row.manager_id) : null;
}

async function canManageRequester(managerId: string, requesterId: string): Promise<boolean> {
  if (normalizeUserId(managerId) === normalizeUserId(requesterId)) return true;
  const { rows } = await pool.query<{ id: string }>(
    `WITH RECURSIVE sub_tree AS (
       SELECT id, manager_id FROM users WHERE ${normIdSql('manager_id')} = $1
       UNION ALL
       SELECT u.id, u.manager_id
       FROM users u
       INNER JOIN sub_tree s ON ${normIdSql('u.manager_id')} = ${normIdSql('s.id')}
     )
     SELECT id FROM sub_tree WHERE ${normIdSql('id')} = $2 LIMIT 1`,
    [normalizeUserId(managerId), normalizeUserId(requesterId)]
  );
  return rows.length > 0;
}

router.get('/types', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT et.id, et.label, et.is_active AS "isActive", et.created_at AS "createdAt", et.updated_at AS "updatedAt",
         et.updated_by AS "updatedById",
         COALESCE(u.name, '') AS "updatedByName"
       FROM expense_types et
       LEFT JOIN users u ON u.id = et.updated_by
       ORDER BY et.label ASC`
    );
    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/types', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'เฉพาะ Admin เท่านั้น' });
    const id = String(req.body?.id ?? '').trim() || randomId('ET');
    const label = String(req.body?.label ?? '').trim();
    if (!label) return res.status(400).json({ error: 'กรุณาระบุชื่อประเภทค่าใช้จ่าย' });
    const isActive = req.body?.isActive !== false;
    const existingById = await pool.query<{ id: string }>(
      `SELECT id FROM expense_types WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (existingById.rows.length > 0) {
      await pool.query(
        `UPDATE expense_types
         SET label = $2,
             is_active = $3,
             updated_by = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [id, label, isActive, req.user?.id ?? null]
      );
    } else {
      // ถ้าชื่อซ้ำ ให้ถือว่าเป็นการเปิดใช้งาน/อัปเดตรายการเดิมแทน ไม่โยน error
      await pool.query(
        `INSERT INTO expense_types (id, label, is_active)
         VALUES ($1, $2, $3)
         ON CONFLICT (label) DO UPDATE SET
           is_active = EXCLUDED.is_active,
           updated_by = $4,
           updated_at = NOW()`,
        [id, label, isActive, req.user?.id ?? null]
      );
      await pool.query(`UPDATE expense_types SET updated_by = $2 WHERE label = $1 AND updated_by IS NULL`, [label, req.user?.id ?? null]);
    }
    const { rows } = await pool.query(
      `SELECT et.id, et.label, et.is_active AS "isActive", et.created_at AS "createdAt", et.updated_at AS "updatedAt",
         et.updated_by AS "updatedById",
         COALESCE(u.name, '') AS "updatedByName"
       FROM expense_types et
       LEFT JOIN users u ON u.id = et.updated_by
       WHERE et.label = $1
       ORDER BY et.updated_at DESC
       LIMIT 1`,
      [label]
    );
    res.status(201).json(rows[0] ?? null);
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && (err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'ชื่อประเภทค่าใช้จ่ายซ้ำในระบบ' });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.delete('/types/:id', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'เฉพาะ Admin เท่านั้น' });
    const id = String(req.params.id ?? '').trim();
    await pool.query(`UPDATE expense_types SET is_active = FALSE, updated_by = $2, updated_at = NOW() WHERE id = $1`, [id, req.user?.id ?? null]);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/claims', requireAuth, async (req, res) => {
  try {
    const userId = normalizeUserId(req.user?.id);
    const userRole = normalizeRole(req.user?.role ?? 'EMPLOYEE');
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const scope = String(req.query.scope ?? '').trim();

    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (from) {
      where.push(`c.claim_date >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      where.push(`c.claim_date <= $${idx++}`);
      params.push(to);
    }
    if (userRole === 'ADMIN') {
      if (scope === 'mine') {
        where.push(`${normIdSql('c.requester_id')} = $${idx++}`);
        params.push(userId);
      } else if (scope === 'subordinates') {
        // Admin โหมด "ผู้ใต้บังคับบัญชา": แสดงทุกคนยกเว้นตัวเอง
        // เพื่อให้ไม่พลาดข้อมูลจากความคลาดเคลื่อนของโครงสร้าง manager_id
        where.push(`${normIdSql('c.requester_id')} <> $${idx}`);
        params.push(userId);
        idx += 1;
      } else {
        // Admin โหมด all: แสดงทุกรายการทุกสถานะ
        // (ผู้ใช้ต้องเห็นข้อมูลครบเหมือนคำว่า "ทั้งหมด")
      }
    } else if (userRole === 'MANAGER' && scope === 'subordinates') {
      where.push(`(
        ${normIdSql('c.requester_id')} = $${idx}
        OR ${normIdSql('c.approver_id')} = $${idx}
        OR EXISTS (
          WITH RECURSIVE sub_tree AS (
            SELECT id, manager_id FROM users WHERE ${normIdSql('manager_id')} = $${idx}
            UNION ALL
            SELECT u.id, u.manager_id
            FROM users u
            INNER JOIN sub_tree s ON ${normIdSql('u.manager_id')} = ${normIdSql('s.id')}
          )
          SELECT 1 FROM sub_tree WHERE ${normIdSql('sub_tree.id')} = ${normIdSql('c.requester_id')}
        )
      )`);
      params.push(userId);
      idx += 1;
    } else {
      where.push(`${normIdSql('c.requester_id')} = $${idx++}`);
      params.push(userId);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         c.id,
         ${normIdSql('c.requester_id')} AS "requesterId",
         COALESCE(ru.name, ${normIdSql('c.requester_id')}) AS "requesterName",
         ${normIdSql('c.approver_id')} AS "approverId",
         COALESCE(au.name, ${normIdSql('c.approver_id')}) AS "approverName",
         c.status,
         c.claim_date AS "claimDate",
         c.submitted_at AS "submittedAt",
         c.approved_at AS "approvedAt",
         c.rejected_at AS "rejectedAt",
         c.reject_reason AS "rejectReason",
         c.paid_date AS "paidDate",
         ${normIdSql("(to_jsonb(c)->>'paid_set_by_id')")} AS "paidById",
         COALESCE(pu.name, ${normIdSql("(to_jsonb(c)->>'paid_set_by_id')")}) AS "paidByName",
         NULLIF(to_jsonb(c)->>'paid_set_at', '') AS "paidSetAt",
         c.admin_note AS "adminNote",
         COALESCE(
           STRING_AGG(DISTINCT COALESCE(p.name, i.project_id, '-'), ' | ')
             FILTER (WHERE i.id IS NOT NULL),
           '-'
         ) AS "projectSummary",
         COALESCE(
           STRING_AGG(NULLIF(TRIM(COALESCE(i.detail, '')), ''), ' | ')
             FILTER (WHERE i.id IS NOT NULL),
           '-'
         ) AS "detailSummary",
         COALESCE(SUM(i.amount), 0) AS "totalAmount",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt"
       FROM expense_claims c
       LEFT JOIN users ru ON ${normIdSql('ru.id')} = ${normIdSql('c.requester_id')}
       LEFT JOIN users au ON ${normIdSql('au.id')} = ${normIdSql('c.approver_id')}
       LEFT JOIN users pu ON ${normIdSql('pu.id')} = ${normIdSql("(to_jsonb(c)->>'paid_set_by_id')")}
       LEFT JOIN expense_claim_items i ON i.claim_id = c.id
       LEFT JOIN timesheet_projects p ON p.id = i.project_id
       ${whereSql}
       GROUP BY c.id, ru.name, au.name, pu.name
       ORDER BY c.claim_date DESC, c.updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/claims/:id', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const { rows } = await pool.query(
      `SELECT
         c.id,
         ${normIdSql('c.requester_id')} AS "requesterId",
         COALESCE(ru.name, ${normIdSql('c.requester_id')}) AS "requesterName",
         ${normIdSql('c.approver_id')} AS "approverId",
         COALESCE(au.name, ${normIdSql('c.approver_id')}) AS "approverName",
         c.status,
         c.claim_date AS "claimDate",
         c.submitted_at AS "submittedAt",
         c.approved_at AS "approvedAt",
         c.rejected_at AS "rejectedAt",
         c.reject_reason AS "rejectReason",
         c.paid_date AS "paidDate",
         ${normIdSql("(to_jsonb(c)->>'paid_set_by_id')")} AS "paidById",
         COALESCE(pu.name, ${normIdSql("(to_jsonb(c)->>'paid_set_by_id')")}) AS "paidByName",
         NULLIF(to_jsonb(c)->>'paid_set_at', '') AS "paidSetAt",
         c.admin_note AS "adminNote",
         COALESCE(SUM(i.amount), 0) AS "totalAmount",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt"
       FROM expense_claims c
       LEFT JOIN users ru ON ${normIdSql('ru.id')} = ${normIdSql('c.requester_id')}
       LEFT JOIN users au ON ${normIdSql('au.id')} = ${normIdSql('c.approver_id')}
       LEFT JOIN users pu ON ${normIdSql('pu.id')} = ${normIdSql("(to_jsonb(c)->>'paid_set_by_id')")}
       LEFT JOIN expense_claim_items i ON i.claim_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, ru.name, au.name, pu.name`,
      [id]
    );
    const claim = rows[0];
    if (!claim) return res.status(404).json({ error: 'ไม่พบเอกสารใบเบิก' });
    const userId = normalizeUserId(req.user?.id);
    const userRole = normalizeRole(req.user?.role ?? 'EMPLOYEE');
    const canRead =
      userRole === 'ADMIN' ||
      userId === claim.requesterId ||
      userId === claim.approverId ||
      (userRole === 'MANAGER' && (await canManageRequester(userId, claim.requesterId)));
    if (!canRead) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูข้อมูลนี้' });
    const items = await pool.query(
      `SELECT
         id,
         expense_date AS "expenseDate",
         project_id AS "projectId",
         expense_type_id AS "expenseTypeId",
         detail,
         amount
       FROM expense_claim_items
       WHERE claim_id = $1
       ORDER BY expense_date ASC, created_at ASC`,
      [id]
    );
    res.json({ ...claim, items: items.rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/claims', requireAuth, async (req, res) => {
  try {
    const requesterId = normalizeUserId(req.body?.requesterId ?? req.user?.id);
    const actorId = normalizeUserId(req.user?.id);
    const actorRole = normalizeRole(req.user?.role ?? 'EMPLOYEE');
    if (requesterId !== actorId && actorRole !== 'ADMIN') return res.status(403).json({ error: 'ไม่มีสิทธิ์สร้างใบเบิกแทนผู้อื่น' });
    const claimDate = String(req.body?.claimDate ?? '').trim();
    const status = String(req.body?.status ?? 'DRAFT').trim() === 'WAITING' ? 'WAITING' : 'DRAFT';
    const adminNote = String(req.body?.adminNote ?? '').trim().slice(0, 1000);
    const incomingId = String(req.body?.id ?? '').trim();
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!claimDate) return res.status(400).json({ error: 'กรุณาระบุวันที่ทำรายการเบิก' });
    if (itemsRaw.length === 0) return res.status(400).json({ error: 'กรุณาเพิ่มรายการค่าใช้จ่ายอย่างน้อย 1 รายการ' });
    const approverId = await getApproverId(requesterId);
    await pool.query('BEGIN');
    const id = incomingId || (await generateMonthlyClaimId(claimDate));
    await pool.query(
      `INSERT INTO expense_claims
        (id, requester_id, approver_id, status, claim_date, submitted_at, admin_note, rejected_at, reject_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET
         claim_date = EXCLUDED.claim_date,
         approver_id = EXCLUDED.approver_id,
         status = CASE WHEN expense_claims.status IN ('PAID','APPROVED') THEN expense_claims.status ELSE EXCLUDED.status END,
         submitted_at = CASE
           WHEN expense_claims.status IN ('PAID','APPROVED') THEN expense_claims.submitted_at
           WHEN EXCLUDED.status = 'WAITING' THEN COALESCE(expense_claims.submitted_at, NOW())
           ELSE NULL
         END,
         admin_note = EXCLUDED.admin_note,
         rejected_at = CASE WHEN EXCLUDED.status IN ('DRAFT', 'WAITING') THEN NULL ELSE expense_claims.rejected_at END,
         reject_reason = CASE WHEN EXCLUDED.status IN ('DRAFT', 'WAITING') THEN NULL ELSE expense_claims.reject_reason END,
         updated_at = NOW()`,
      [id, requesterId, approverId, status, claimDate, status === 'WAITING' ? new Date().toISOString() : null, adminNote]
    );
    await pool.query(`DELETE FROM expense_claim_items WHERE claim_id = $1`, [id]);
    for (const raw of itemsRaw as Array<Record<string, unknown>>) {
      const itemId = String(raw.id ?? '').trim() || randomId('EI');
      const expenseDate = String(raw.expenseDate ?? '').trim();
      const projectIdRaw = String(raw.projectId ?? '').trim();
      const projectId = projectIdRaw || null;
      const expenseTypeId = String(raw.expenseTypeId ?? '').trim();
      const detail = String(raw.detail ?? '').trim().slice(0, 1000);
      const amountRaw = Number(raw.amount ?? 0);
      const amount = Number.isFinite(amountRaw) ? Math.max(0, amountRaw) : 0;
      if (!expenseDate || !expenseTypeId) continue;
      await pool.query(
        `INSERT INTO expense_claim_items (id, claim_id, expense_date, project_id, expense_type_id, detail, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [itemId, id, expenseDate, projectId, expenseTypeId, detail, amount]
      );
    }
    await pool.query('COMMIT');
    const { rows } = await pool.query(
      `SELECT id FROM expense_claims WHERE id = $1`,
      [id]
    );
    res.status(201).json({ id: rows[0]?.id ?? id });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/claims/:id/approve', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const actorId = normalizeUserId(req.user?.id);
    const current = await pool.query<{ requester_id: string; status: string; approver_id: string | null }>(
      `SELECT ${normIdSql('requester_id')} AS requester_id, status, ${normIdSql('approver_id')} AS approver_id
       FROM expense_claims
       WHERE id = $1`,
      [id]
    );
    const claim = current.rows[0];
    if (!claim) return res.status(404).json({ error: 'ไม่พบเอกสารใบเบิก' });
    const actorRole = await getUserRoleByNormalizedId(actorId);
    const isSelfRequest = normalizeUserId(claim.requester_id) === actorId;
    const inManagementChain = await canManageRequester(actorId, claim.requester_id);
    const canApprove =
      claim.status === 'WAITING' &&
      !isSelfRequest &&
      (actorRole === 'ADMIN' || inManagementChain);
    if (!canApprove) return res.status(403).json({ error: 'ไม่มีสิทธิ์อนุมัติรายการนี้' });
    if (claim.status !== 'WAITING') return res.status(400).json({ error: 'รายการนี้ยังไม่อยู่ในสถานะ Waiting' });
    await pool.query(
      `UPDATE expense_claims
       SET status = 'APPROVED',
           approved_at = NOW(),
           rejected_at = NULL,
           reject_reason = NULL,
           approver_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, actorId]
    );
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/claims/:id/reject', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const actorId = normalizeUserId(req.user?.id);
    const reason = String(req.body?.reason ?? '').trim().slice(0, 1000);
    if (!reason) return res.status(400).json({ error: 'กรุณาระบุเหตุผลการไม่อนุมัติ' });
    const current = await pool.query<{ requester_id: string; status: string; approver_id: string | null }>(
      `SELECT ${normIdSql('requester_id')} AS requester_id, status, ${normIdSql('approver_id')} AS approver_id
       FROM expense_claims
       WHERE id = $1`,
      [id]
    );
    const claim = current.rows[0];
    if (!claim) return res.status(404).json({ error: 'ไม่พบเอกสารใบเบิก' });
    const actorRole = await getUserRoleByNormalizedId(actorId);
    const isSelfRequest = normalizeUserId(claim.requester_id) === actorId;
    const inManagementChain = await canManageRequester(actorId, claim.requester_id);
    const canReject =
      claim.status === 'WAITING' &&
      !isSelfRequest &&
      (actorRole === 'ADMIN' || inManagementChain);
    if (!canReject) return res.status(403).json({ error: 'ไม่มีสิทธิ์ Reject รายการนี้' });
    if (claim.status !== 'WAITING') return res.status(400).json({ error: 'รายการนี้ยังไม่อยู่ในสถานะ Waiting' });
    await pool.query(
      `UPDATE expense_claims
       SET status = 'REJECTED',
           rejected_at = NOW(),
           reject_reason = $2,
           approver_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [id, reason, actorId]
    );
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/claims/:id/pay-date', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'เฉพาะ Admin เท่านั้น' });
    const id = String(req.params.id ?? '').trim();
    const actorId = normalizeUserId(req.user?.id);
    const paidDate = String(req.body?.paidDate ?? '').trim();
    if (!paidDate) return res.status(400).json({ error: 'กรุณาระบุวันทำจ่าย' });
    const colCheck = await pool.query<{ has_paid_audit: boolean }>(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'expense_claims' AND column_name = 'paid_set_by_id'
         )
         AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'expense_claims' AND column_name = 'paid_set_at'
         ) AS has_paid_audit`
    );
    const hasPaidAudit = colCheck.rows[0]?.has_paid_audit === true;
    if (hasPaidAudit) {
      await pool.query(
        `UPDATE expense_claims
         SET paid_date = $2,
             paid_set_by_id = $3,
             paid_set_at = NOW(),
             status = 'PAID',
             updated_at = NOW()
         WHERE id = $1`,
        [id, paidDate, actorId]
      );
    } else {
      await pool.query(
        `UPDATE expense_claims
         SET paid_date = $2,
             status = 'PAID',
             updated_at = NOW()
         WHERE id = $1`,
        [id, paidDate]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/claims/:id/submit', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const actorId = normalizeUserId(req.user?.id);
    const actorRole = req.user?.role ?? 'EMPLOYEE';
    const current = await pool.query<{ requester_id: string; status: string; approver_id: string | null }>(
      `SELECT ${normIdSql('requester_id')} AS requester_id, status, ${normIdSql('approver_id')} AS approver_id
       FROM expense_claims
       WHERE id = $1`,
      [id]
    );
    const claim = current.rows[0];
    if (!claim) return res.status(404).json({ error: 'ไม่พบเอกสารใบเบิก' });
    if (claim.requester_id !== actorId && actorRole !== 'ADMIN') {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ Submit เอกสารนี้' });
    }
    if (!['DRAFT', 'REJECTED'].includes(claim.status)) {
      return res.status(400).json({ error: 'Submit ได้เฉพาะรายการที่ยังเป็น Save หรือ Reject เท่านั้น' });
    }
    const countItems = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM expense_claim_items WHERE claim_id = $1`,
      [id]
    );
    if (Number(countItems.rows[0]?.c ?? 0) <= 0) {
      return res.status(400).json({ error: 'ไม่พบรายการค่าใช้จ่ายในใบเบิก' });
    }
    const derivedApprover = claim.approver_id ?? (await getApproverId(claim.requester_id));
    await pool.query(
      `UPDATE expense_claims
       SET status = 'WAITING',
           approver_id = COALESCE($2, approver_id),
           rejected_at = NULL,
           reject_reason = NULL,
           submitted_at = COALESCE(submitted_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [id, derivedApprover]
    );
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
