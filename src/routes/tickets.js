const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

const JWT_SECRET = "secret";

// ================================
// AUTH MIDDLEWARE
// ================================
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ================================
// GET /tickets/stats
// ================================
router.get('/stats', auth, async (req, res) => {
  try {
    const [total, open, critical, in_progress, resolved, closed, recent] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'open' }),
      Ticket.countDocuments({ status: 'open', priority: 'critical' }),
      Ticket.countDocuments({ status: 'in-progress' }),
      Ticket.countDocuments({ status: 'resolved' }),
      Ticket.countDocuments({ status: 'closed' }),
      Ticket.find().sort({ createdAt: -1 }).limit(5).lean()
    ]);

    // ✅ Get real employee names
    const userIds = recent.map(t => t.created_by).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const recent_tickets = recent.map(t => {
      const u = userMap[t.created_by?.toString()];
      return {
        _id: t._id,
        id: t._id,
        ticket_no: t.ticket_no,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        category: t.category,
        emp_name: u?.name || 'Unknown',         // ✅ Real name
        department: u?.department || 'N/A',      // ✅ Real department
        created_at: t.createdAt
      };
    });

    res.json({ total, open, critical, in_progress, resolved, closed, recent_tickets, recent_activity: [] });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ================================
// GET /tickets/my-stats
// ================================
router.get('/my-stats', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const [total, open, in_progress, resolved, closed] = await Promise.all([
      Ticket.countDocuments({ created_by: uid }),
      Ticket.countDocuments({ created_by: uid, status: 'open' }),
      Ticket.countDocuments({ created_by: uid, status: 'in-progress' }),
      Ticket.countDocuments({ created_by: uid, status: 'resolved' }),
      Ticket.countDocuments({ created_by: uid, status: 'closed' })
    ]);
    res.json({ total, open, in_progress, resolved, closed });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ================================
// GET /tickets/my-tickets
// ================================
router.get('/my-tickets', auth, async (req, res) => {
  try {
    const tickets = await Ticket.find({ created_by: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const user = await User.findById(req.user.id).lean();

    const mapped = tickets.map(t => ({
      ...t,
      id: t._id,
      emp_name: user?.name || 'Unknown',          // ✅ Real name
      department: user?.department || 'N/A',       // ✅ Real department
      created_at: t.createdAt
    }));

    res.json(mapped);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ================================
// GET /tickets
// ================================
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .sort({ createdAt: -1 })
      .lean();

    // ✅ Get all user IDs from tickets
    const userIds = tickets.map(t => t.created_by).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const mapped = tickets.map(t => {
      const u = userMap[t.created_by?.toString()];
      return {
        ...t,
        id: t._id,
        emp_name: u?.name || 'Unknown',           // ✅ Real name
        department: u?.department || 'N/A',        // ✅ Real department
        created_at: t.createdAt
      };
    });

    res.json(mapped);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ================================
// POST /tickets
// ================================
router.post('/', auth, async (req, res) => {
  try {
    const { category, priority, subject, description, asset, contact_pref } = req.body;

    const ticket_no = `TKT-${Date.now()}`;

    const ticket = new Ticket({
      ticket_no,
      category,
      priority,
      subject,
      description,
      asset,
      contact_pref,
      created_by: req.user.id,
      status: 'open'
    });

    await ticket.save();

    res.json({ success: true, ticket_no: ticket.ticket_no, ticket });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /tickets/:id
router.get('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const user = await User.findById(ticket.created_by).lean();

    res.json({
      ...ticket,
      id: ticket._id,
      emp_name: user?.name || 'Unknown',
      department: user?.department || 'N/A',
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
      logs: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single ticket
router.get('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const user = await User.findById(ticket.created_by).lean();
    res.json({
      ...ticket,
      id: ticket._id,
      emp_name: user?.name || 'Unknown',
      emp_email: user?.email || '',
      emp_code: user?.emp_id || '',
      department: user?.department || 'N/A',
      phone: user?.phone || '',
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
      logs: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH single ticket
router.patch('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;