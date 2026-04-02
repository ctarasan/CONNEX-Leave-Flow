import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function normalizeUserId(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return String(parseInt(s, 10)).padStart(3, '0');
  return s;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

function getBangkokDateOnly(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

router.get('/task-types', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, display_order AS "order", is_active AS "isActive"
       FROM timesheet_task_types
       ORDER BY display_order ASC, id ASC`
    );
    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.put('/task-types', requireAuth, async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'payload ต้องเป็น array' });
    }
    await pool.query('BEGIN');
    for (const item of req.body as Array<Record<string, unknown>>) {
      const id = String(item.id ?? '').trim();
      const label = String(item.label ?? '').trim();
      const order = Number(item.order ?? 0);
      const isActive = item.isActive !== false;
      if (!id || !label) continue;
      await pool.query(
        `INSERT INTO timesheet_task_types (id, label, display_order, is_active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label,
           display_order = EXCLUDED.display_order,
           is_active = EXCLUDED.is_active`,
        [id, label, Number.isFinite(order) ? order : 0, isActive]
      );
    }
    await pool.query('COMMIT');
    const { rows } = await pool.query(
      `SELECT id, label, display_order AS "order", is_active AS "isActive"
       FROM timesheet_task_types
       ORDER BY display_order ASC, id ASC`
    );
    res.json(rows);
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/projects', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         code,
         name,
         project_manager_id AS "projectManagerId",
         assigned_user_ids AS "assignedUserIds",
         task_target_days AS "taskTargetDays",
         is_active AS "isActive",
         updated_by AS "updatedById",
         COALESCE(editor.name, '') AS "updatedByName"
       FROM timesheet_projects p
       LEFT JOIN users editor ON editor.id = p.updated_by
       ORDER BY p.code ASC, p.id ASC`
    );
    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/projects', requireAuth, async (req, res) => {
  try {
    const id = String(req.body?.id ?? '').trim() || randomId('P');
    const code = String(req.body?.code ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const projectManagerId = normalizeUserId(req.body?.projectManagerId ?? '');
    const assignedRaw = Array.isArray(req.body?.assignedUserIds) ? req.body.assignedUserIds : [];
    const assignedUserIds = Array.from(new Set(assignedRaw.map((x: unknown) => normalizeUserId(x)).filter(Boolean)));
    const taskTargetDays = req.body?.taskTargetDays && typeof req.body.taskTargetDays === 'object'
      ? req.body.taskTargetDays
      : {};
    const isActive = req.body?.isActive !== false;

    if (!code || !name || !projectManagerId) {
      return res.status(400).json({ error: 'ต้องมี code, name, projectManagerId' });
    }

    await pool.query(
      `INSERT INTO timesheet_projects
        (id, code, name, project_manager_id, assigned_user_ids, task_target_days, is_active, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         name = EXCLUDED.name,
         project_manager_id = EXCLUDED.project_manager_id,
         assigned_user_ids = EXCLUDED.assigned_user_ids,
         task_target_days = EXCLUDED.task_target_days,
         is_active = EXCLUDED.is_active,
         updated_by = EXCLUDED.updated_by`,
      [id, code, name, projectManagerId, assignedUserIds, JSON.stringify(taskTargetDays), isActive, req.user?.id ?? null]
    );

    const { rows } = await pool.query(
      `SELECT
         id,
         code,
         name,
         project_manager_id AS "projectManagerId",
         assigned_user_ids AS "assignedUserIds",
         task_target_days AS "taskTargetDays",
         is_active AS "isActive",
         updated_by AS "updatedById",
         COALESCE(editor.name, '') AS "updatedByName"
       FROM timesheet_projects p
       LEFT JOIN users editor ON editor.id = p.updated_by
       WHERE p.id = $1`,
      [id]
    );
    res.status(201).json(rows[0] ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/entries', async (req, res) => {
  try {
    const userId = req.query.userId ? normalizeUserId(req.query.userId) : '';
    const date = req.query.date ? String(req.query.date).trim() : '';
    const projectId = req.query.projectId ? String(req.query.projectId).trim() : '';
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (userId) {
      where.push(`user_id = $${idx++}`);
      params.push(userId);
    }
    if (date) {
      where.push(`entry_date = $${idx++}`);
      params.push(date);
    }
    if (projectId) {
      where.push(`project_id = $${idx++}`);
      params.push(projectId);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         id,
         user_id AS "userId",
         entry_date AS "date",
         project_id AS "projectId",
         task_type_id AS "taskType",
         minutes,
         updated_at AS "updatedAt"
       FROM timesheet_entries
       ${whereSql}
       ORDER BY entry_date DESC, updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/entries', requireAuth, async (req, res) => {
  try {
    const userId = normalizeUserId(req.body?.userId ?? '');
    const date = String(req.body?.date ?? '').trim();
    const projectId = String(req.body?.projectId ?? '').trim();
    const taskType = String(req.body?.taskType ?? '').trim();
    const minutesRaw = Number(req.body?.minutes ?? 0);
    const minutes = Number.isFinite(minutesRaw) ? Math.min(1440, Math.max(0, Math.round(minutesRaw))) : 0;
    const id = String(req.body?.id ?? '').trim() || randomId('TS');

    if (!userId || !date || !projectId || !taskType) {
      return res.status(400).json({ error: 'ต้องมี userId, date, projectId, taskType' });
    }
    if (date > getBangkokDateOnly()) {
      return res.status(400).json({ error: 'ไม่สามารถลง Timesheet ล่วงหน้าได้ (เลือกได้เฉพาะวันนี้หรือย้อนหลัง)' });
    }

    await pool.query(
      `INSERT INTO timesheet_entries (id, user_id, entry_date, project_id, task_type_id, minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, entry_date, project_id, task_type_id)
       DO UPDATE SET
         minutes = EXCLUDED.minutes,
         updated_at = NOW()`,
      [id, userId, date, projectId, taskType, minutes]
    );

    const { rows } = await pool.query(
      `SELECT
         id,
         user_id AS "userId",
         entry_date AS "date",
         project_id AS "projectId",
         task_type_id AS "taskType",
         minutes,
         updated_at AS "updatedAt"
       FROM timesheet_entries
       WHERE user_id = $1 AND entry_date = $2 AND project_id = $3 AND task_type_id = $4`,
      [userId, date, projectId, taskType]
    );
    res.status(201).json(rows[0] ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
