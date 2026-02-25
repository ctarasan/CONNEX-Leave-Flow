import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { rowToCamel } from '../util.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, gender, department, join_date as "joinDate", manager_id as "managerId",
        sick_quota, personal_quota, vacation_quota, ordination_quota, 
        military_quota, maternity_quota, sterilization_quota, paternity_quota
      FROM users ORDER BY id`
    );
    const list = rows.map((r: Record<string, unknown>) => {
      const { sick_quota, personal_quota, vacation_quota, ordination_quota, military_quota, maternity_quota, sterilization_quota, paternity_quota, ...rest } = r;
      const o = rowToCamel(rest);
      return { 
        ...o, 
        password: '',
        quotas: {
          sick: sick_quota || 0,
          personal: personal_quota || 0,
          vacation: vacation_quota || 0,
          ordination: ordination_quota || 0,
          military: military_quota || 0,
          maternity: maternity_quota || 0,
          sterilization: sterilization_quota || 0,
          paternity: paternity_quota || 0,
        }
      };
    });
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id, name, email, password, role = 'EMPLOYEE', gender, department = '', joinDate, managerId, quotas } = req.body;
    if (!name || !email || !password || !gender || !joinDate) {
      return res.status(400).json({ error: 'ต้องมี name, email, password, gender, joinDate' });
    }
    const uid = id || `U${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Extract quotas
    const q = quotas && typeof quotas === 'object' ? quotas : {};
    const sickQuota = q.sick || 0;
    const personalQuota = q.personal || 0;
    const vacationQuota = q.vacation || 0;
    const ordinationQuota = q.ordination || 0;
    const militaryQuota = q.military || 0;
    const maternityQuota = q.maternity || 0;
    const sterilizationQuota = q.sterilization || 0;
    const paternityQuota = q.paternity || 0;
    
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, gender, department, join_date, manager_id,
        sick_quota, personal_quota, vacation_quota, ordination_quota, military_quota, maternity_quota, sterilization_quota, paternity_quota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO NOTHING`,
      [uid, name, email, passwordHash, role, gender, department, joinDate, managerId || null,
       sickQuota, personalQuota, vacationQuota, ordinationQuota, militaryQuota, maternityQuota, sterilizationQuota, paternityQuota]
    );
    res.status(201).json({ id: uid, name, email, role, gender, department, joinDate, managerId: managerId || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const bodyKeys = Object.keys(req.body || {});
    const passwordInBody = 'password' in (req.body || {});
    // #region agent log
    fetch('http://127.0.0.1:7674/ingest/df21c9fd-6b65-40c3-af5e-5cbb5dd5b203', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ab67f8' }, body: JSON.stringify({ sessionId: 'ab67f8', location: 'users.ts:PUT', message: 'PUT user body', data: { id, bodyKeys, passwordInBody }, timestamp: Date.now(), hypothesisId: 'H1,H4' }) }).catch(() => {});
    // #endregion
    const { name, email, role, gender, department, joinDate, managerId, quotas, password } = req.body;
    if (!id) return res.status(400).json({ error: 'ต้องมี id' });
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (typeof password === 'string' && password.trim() !== '') {
      const passwordHash = await bcrypt.hash(password.trim(), 10);
      updates.push(`password_hash = $${i++}`);
      values.push(passwordHash);
    }
    if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name); }
    if (email !== undefined) { updates.push(`email = $${i++}`); values.push(email); }
    if (role !== undefined) { updates.push(`role = $${i++}`); values.push(role); }
    if (gender !== undefined) { updates.push(`gender = $${i++}`); values.push(gender); }
    if (department !== undefined) { updates.push(`department = $${i++}`); values.push(department); }
    if (joinDate !== undefined) { updates.push(`join_date = $${i++}`); values.push(joinDate); }
    if (managerId !== undefined) { updates.push(`manager_id = $${i++}`); values.push(managerId || null); }
    if (quotas !== undefined && typeof quotas === 'object') {
      if (quotas.sick !== undefined) { updates.push(`sick_quota = $${i++}`); values.push(quotas.sick); }
      if (quotas.personal !== undefined) { updates.push(`personal_quota = $${i++}`); values.push(quotas.personal); }
      if (quotas.vacation !== undefined) { updates.push(`vacation_quota = $${i++}`); values.push(quotas.vacation); }
      if (quotas.ordination !== undefined) { updates.push(`ordination_quota = $${i++}`); values.push(quotas.ordination); }
      if (quotas.military !== undefined) { updates.push(`military_quota = $${i++}`); values.push(quotas.military); }
      if (quotas.maternity !== undefined) { updates.push(`maternity_quota = $${i++}`); values.push(quotas.maternity); }
      if (quotas.sterilization !== undefined) { updates.push(`sterilization_quota = $${i++}`); values.push(quotas.sterilization); }
      if (quotas.paternity !== undefined) { updates.push(`paternity_quota = $${i++}`); values.push(quotas.paternity); }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'ไม่มีฟิลด์ที่อัปเดต' });
    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i}`, values);
    const { rows } = await pool.query(
      `SELECT id, name, email, role, gender, department, join_date as "joinDate", manager_id as "managerId",
        sick_quota, personal_quota, vacation_quota, ordination_quota, 
        military_quota, maternity_quota, sterilization_quota, paternity_quota
      FROM users WHERE id = $1`, 
      [id]
    );
    if (rows[0]) {
      const { sick_quota, personal_quota, vacation_quota, ordination_quota, military_quota, maternity_quota, sterilization_quota, paternity_quota, ...rest } = rows[0];
      const r = rowToCamel(rest as Record<string, unknown>);
      res.json({ 
        ...r, 
        password: '',
        quotas: {
          sick: sick_quota || 0,
          personal: personal_quota || 0,
          vacation: vacation_quota || 0,
          ordination: ordination_quota || 0,
          military: military_quota || 0,
          maternity: maternity_quota || 0,
          sterilization: sterilization_quota || 0,
          paternity: paternity_quota || 0,
        }
      });
    } else {
      res.json(null);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'ต้องมี id' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
