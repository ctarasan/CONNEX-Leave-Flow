import { Router } from 'express';
import { pool } from '../db.js';
import { rowToCamel } from '../util.js';

const router = Router();

/** GET /api/leave-requests - ดึงคำขอลา (เลือกได้ตาม userId) */
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    let query = `SELECT id, user_id as "userId", user_name as "userName", type, start_date as "startDate", end_date as "endDate",
      reason, status, (submitted_at AT TIME ZONE 'UTC') as "submittedAt", (reviewed_at AT TIME ZONE 'UTC') as "reviewedAt", manager_comment as "managerComment"
      FROM leave_requests`;
    const params: string[] = [];
    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY submitted_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows.map((r: Record<string, unknown>) => rowToCamel(r)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** POST /api/leave-requests - สร้างคำขอลา */
router.post('/', async (req, res) => {
  console.log('🔵 [POST /api/leave-requests] Request received:', req.body);
  try {
    const { userId, userName, type, startDate, endDate, reason } = req.body;
    console.log('🔵 Extracted data:', { userId, userName, type, startDate, endDate, reason: reason?.substring(0, 50) });
    
    if (!userId || !userName || !type || !startDate || !endDate || reason === undefined) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ error: 'ต้องมี userId, userName, type, startDate, endDate, reason' });
    }
    
    const id = `LR${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    console.log('🔵 Inserting leave request with ID:', id);
    
    await pool.query(
      `INSERT INTO leave_requests (id, user_id, user_name, type, start_date, end_date, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
      [id, userId, userName, type, startDate, endDate, String(reason).slice(0, 2000)]
    );
    
    console.log('✅ Leave request inserted successfully');
    
    const { rows } = await pool.query(
      `SELECT id, user_id as "userId", user_name as "userName", type, start_date as "startDate", end_date as "endDate",
        reason, status, (submitted_at AT TIME ZONE 'UTC') as "submittedAt", (reviewed_at AT TIME ZONE 'UTC') as "reviewedAt", manager_comment as "managerComment"
       FROM leave_requests WHERE id = $1`,
      [id]
    );
    const row = rows[0] ? rowToCamel(rows[0] as Record<string, unknown>) : null;
    console.log('✅ [POST /api/leave-requests] Response:', row);
    res.status(201).json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ [POST /api/leave-requests] Error:', message, err);
    res.status(500).json({ error: message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const id = req.params.id;
    const { status, managerComment, managerId } = req.body;
    if (!id || !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'ต้องมี id และ status เป็น APPROVED หรือ REJECTED' });
    }
    const managerIdToUse = req.user?.id ?? managerId;
    if (!managerIdToUse) {
      return res.status(401).json({ error: 'ต้องล็อกอินหรือส่ง managerId' });
    }
    const reqRow = await pool.query('SELECT user_id FROM leave_requests WHERE id = $1', [id]);
    const requestUserId = (reqRow.rows[0] as { user_id: string } | undefined)?.user_id;
    if (!requestUserId) {
      return res.status(404).json({ error: 'ไม่พบคำขอลา' });
    }
    const subordinateRow = await pool.query('SELECT manager_id FROM users WHERE id = $1', [requestUserId]);
    const subordinateManagerId = (subordinateRow.rows[0] as { manager_id: string | null } | undefined)?.manager_id;
    if (subordinateManagerId !== managerIdToUse && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'เฉพาะผู้บังคับบัญชาของผู้ยื่นคำขอหรือ Admin เท่านั้นที่อนุมัติได้' });
    }
    const comment = String(managerComment ?? '').trim().slice(0, 500);
    await pool.query(
      `UPDATE leave_requests SET status = $1, manager_comment = $2, reviewed_at = NOW() WHERE id = $3`,
      [status, comment, id]
    );
    const { rows } = await pool.query(
      `SELECT id, user_id as "userId", user_name as "userName", type, start_date as "startDate", end_date as "endDate",
        reason, status, (submitted_at AT TIME ZONE 'UTC') as "submittedAt", (reviewed_at AT TIME ZONE 'UTC') as "reviewedAt", manager_comment as "managerComment"
       FROM leave_requests WHERE id = $1`,
      [id]
    );
    const row = rows[0] ? rowToCamel(rows[0] as Record<string, unknown>) : null;
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
