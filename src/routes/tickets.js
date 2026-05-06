const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const Ticket  = require('../models/Ticket');

const JWT_SECRET = "secret";

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.split(' ')[1];
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ✅ GET /tickets/stats — admin dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    const [total, open, critical, in_progress, resolved, closed, recent] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'open' }),
      Ticket.countDocuments({ status: 'open', priority: 'critical' }),
      Ticket.countDocuments({ status: 'in_progress' }),
      Ticket.countDocuments({ status: 'resolved' }),
      Ticket.countDocuments({ status: 'closed' }),
      // last 10 tickets, populate creator info
      Ticket.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('created_by', 'name emp_id department')
        .lean()
    ]);

    // flatten populated fields for frontend
    const recentMapped = recent.map(t => ({
      ...t,
      id: t._id,
      emp_name:   t.created_by?.name       || '—',
      department: t.created_by?.department || t.department || '—',
      created_at: t.createdAt,
    }));

    res.json({ total, open, critical, in_progress, resolved, closed, recent: recentMapped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET /tickets/my-stats — employee dashboard counts
router.get('/my-stats', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const [total, open, in_progress, resolved, closed] = await Promise.all([
      Ticket.countDocuments({ created_by: uid }),
      Ticket.countDocuments({ created_by: uid, status: 'open' }),
      Ticket.countDocuments({ created_by: uid, status: 'in_progress' }),
      Ticket.countDocuments({ created_by: uid, status: 'resolved' }),
      Ticket.countDocuments({ created_by: uid, status: 'closed' }),
    ]);
    res.json({ total, open, in_progress, resolved, closed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET /tickets/my-tickets — employee's own ticket list
router.get('/my-tickets', auth, async (req, res) => {
  try {
    const tickets = await Ticket.find({ created_by: req.user.id }).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET /tickets — all tickets (admin)
router.get('/', auth, async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 }).populate('created_by', 'name emp_id department');
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ POST /tickets — create a ticket
router.post('/', auth, async (req, res) => {
  try {
    const { category, priority, subject, description, asset, contact_pref } = req.body;
    const ticket_no = `TKT-${Date.now()}`;
    const ticket = new Ticket({
      ticket_no, category, priority, subject,
      description, asset, contact_pref,
      created_by: req.user.id,
      status: 'open',
    });
    await ticket.save();
    res.json({ success: true, ticket_no: ticket.ticket_no, ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;