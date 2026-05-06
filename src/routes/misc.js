const router = require('express').Router();
const db     = require('../lib/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── ASSETS ──
router.get('/assets', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, category, q } = req.query;
    let sql = `SELECT a.*, e.name as assigned_to_name FROM assets a LEFT JOIN asset_assignments aa ON a.id=aa.asset_id AND aa.returned_at IS NULL LEFT JOIN employees e ON aa.emp_id=e.id WHERE 1=1`;
    const params = [];
    if (status)   { sql += ' AND a.status=?';   params.push(status); }
    if (category) { sql += ' AND a.category=?'; params.push(category); }
    if (q)        { sql += ' AND (a.asset_code LIKE ? OR a.name LIKE ?)'; params.push(`%${q}%`,`%${q}%`); }
    sql += ' ORDER BY a.created_at DESC';
    const [rows] = await db.query(sql, params);
    const [[stats]] = await db.query(`SELECT COUNT(*) as total, SUM(status='Available') as available, SUM(status='Assigned') as assigned, SUM(status IN ('Under Repair','Damaged')) as repair FROM assets`);
    res.json({ assets: rows, stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/assets', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { asset_code, name, category, brand, model, serial_no, purchase_date, warranty_until, location, notes, status } = req.body;
    if (!asset_code || !name || !category) return res.status(400).json({ error: 'Asset code, name, category required' });
    const [result] = await db.query(
      'INSERT INTO assets (asset_code,name,category,brand,model,serial_no,purchase_date,warranty_until,location,notes,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [asset_code,name,category,brand||null,model||null,serial_no||null,purchase_date||null,warranty_until||null,location||'',notes||'',status||'Available']);
    await db.query('INSERT INTO asset_logs (asset_id,action,done_by,note) VALUES (?,?,?,?)', [result.insertId,'Asset added to inventory',req.user.id,'']);
    res.json({ success: true, id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Asset code already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/assets/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { asset_code, name, category, brand, model, serial_no, purchase_date, warranty_until, location, notes, status } = req.body;
    await db.query('UPDATE assets SET asset_code=?,name=?,category=?,brand=?,model=?,serial_no=?,purchase_date=?,warranty_until=?,location=?,notes=?,status=? WHERE id=?',
      [asset_code,name,category,brand||null,model||null,serial_no||null,purchase_date||null,warranty_until||null,location,notes,status,req.params.id]);
    await db.query('INSERT INTO asset_logs (asset_id,action,done_by,note) VALUES (?,?,?,?)', [req.params.id,'Asset details updated',req.user.id,'']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/assets/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM asset_logs WHERE asset_id=?', [req.params.id]);
    await db.query('DELETE FROM asset_assignments WHERE asset_id=?', [req.params.id]);
    await db.query('DELETE FROM assets WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── NOTIFICATIONS ──
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT n.*, t.ticket_no, t.priority FROM notifications n LEFT JOIN tickets t ON n.ticket_id=t.id WHERE n.emp_id=? ORDER BY n.created_at DESC LIMIT 100',
      [req.user.id]);
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) as cnt FROM notifications WHERE emp_id=? AND is_read=0', [req.user.id]);
    res.json({ notifications: rows, unread: cnt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/notifications/read', authMiddleware, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE emp_id=?', [req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REPORTS ──
router.get('/reports', authMiddleware, adminOnly, async (req, res) => {
  try {
    const year  = parseInt(req.query.year  || new Date().getFullYear());
    const month = parseInt(req.query.month || new Date().getMonth() + 1);
    const dateFrom = `${year}-${String(month).padStart(2,'0')}-01 00:00:00`;
    const dateTo   = new Date(year, month, 0).toISOString().split('T')[0] + ' 23:59:59';

    const [[tkt]] = await db.query(`SELECT COUNT(*) as total, SUM(status='open') as open_c, SUM(status='in-progress') as inprog, SUM(status='resolved') as resolved, SUM(status='closed') as closed, SUM(priority='critical') as critical, SUM(priority='high') as high_p, SUM(priority='medium') as medium_p, SUM(priority='low') as low_p FROM tickets WHERE created_at BETWEEN ? AND ?`, [dateFrom, dateTo]);
    const [empData] = await db.query(`SELECT e.name, e.emp_id, e.department, COUNT(t.id) as total, SUM(t.status='resolved') as resolved, SUM(t.status IN ('open','in-progress')) as pending FROM employees e LEFT JOIN tickets t ON e.id=t.emp_id AND t.created_at BETWEEN ? AND ? WHERE e.role='employee' GROUP BY e.id ORDER BY total DESC`, [dateFrom, dateTo]);
    const [deptData] = await db.query(`SELECT e.department, COUNT(t.id) as total, SUM(t.status='resolved') as resolved, SUM(t.status IN ('open','in-progress')) as pending FROM tickets t JOIN employees e ON t.emp_id=e.id WHERE t.created_at BETWEEN ? AND ? GROUP BY e.department ORDER BY total DESC`, [dateFrom, dateTo]);
    const [[assetData]] = await db.query(`SELECT COUNT(*) as total, SUM(status='Available') as available, SUM(status='Assigned') as assigned, SUM(status='Under Repair') as repair, SUM(status='Damaged') as damaged, SUM(status='Retired') as retired FROM assets`);
    const [assetCat] = await db.query(`SELECT category, COUNT(*) as cnt FROM assets GROUP BY category ORDER BY cnt DESC`);

    res.json({ tkt, empData, deptData, assetData, assetCat });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROFILE ──
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    await db.query('UPDATE employees SET name=?, phone=? WHERE id=?', [name, phone||'', req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/profile/password', authMiddleware, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { current_password, new_password } = req.body;
    const [[user]] = await db.query('SELECT password FROM employees WHERE id=?', [req.user.id]);
    if (!await bcrypt.compare(current_password, user.password)) return res.status(400).json({ error: 'Current password incorrect' });
    const hashed = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE employees SET password=? WHERE id=?', [hashed, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
