const router = require('express').Router();
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// ======================================
// GET /tickets/stats
// ======================================
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

    const userIds = recent.map(t => t.created_by).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const recent_tickets = recent.map(t => {
      const u = userMap[t.created_by?.toString()];
      return {
        _id: t._id, id: t._id,
        ticket_no: t.ticket_no,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        category: t.category,
        emp_name: u?.name || 'Unknown',
        department: u?.department || 'N/A',
        created_at: t.createdAt
      };
    });

    res.json({ total, open, critical, in_progress, resolved, closed, recent_tickets, recent_activity: [] });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// GET /tickets/my-stats
// ======================================
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

// ======================================
// GET /tickets/my-tickets
// ======================================
router.get('/my-tickets', auth, async (req, res) => {
  try {
    const tickets = await Ticket.find({ created_by: req.user.id }).sort({ createdAt: -1 }).lean();
    const user = await User.findById(req.user.id).lean();
    const mapped = tickets.map(t => ({
      ...t, id: t._id,
      emp_name: user?.name || 'Unknown',
      department: user?.department || 'N/A',
      created_at: t.createdAt
    }));
    res.json(mapped);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// GET /tickets
// ======================================
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 }).lean();
    const userIds = tickets.map(t => t.created_by).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });
    const mapped = tickets.map(t => {
      const u = userMap[t.created_by?.toString()];
      return {
        ...t, id: t._id,
        emp_name: u?.name || 'Unknown',
        department: u?.department || 'N/A',
        created_at: t.createdAt
      };
    });
    res.json(mapped);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// POST /tickets ✅ ONLY ONE
// ======================================
router.post('/', auth, async (req, res) => {
  try {
    const { category, priority, subject, description, asset, contact_pref } = req.body;

    const ticket_no = `TKT-${Date.now()}`;

    const ticket = new Ticket({
      ticket_no, category, priority, subject,
      description, asset, contact_pref,
      created_by: req.user.id,
      status: 'open'
    });

    await ticket.save();

    // ✅ Notify admin
    await Notification.create({
      message: `New ticket ${ticket_no} raised: "${subject}" (${priority} priority)`,
      type: 'ticket_created',
      role: 'admin',
      ticket_id: ticket._id,
      user_id: req.user.id,
    });

    // ✅ Notify employee
    await Notification.create({
      message: `Your ticket "${subject}" has been submitted successfully.`,
      type: 'ticket_created',
      role: 'employee',
      ticket_id: ticket._id,
      user_id: req.user.id,
    });

    res.json({ success: true, ticket_no: ticket.ticket_no, ticket });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// GET SINGLE TICKET
// ======================================
// ======================================
// GET SINGLE TICKET
// ======================================
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const user = await User.findById(ticket.created_by).lean();
    res.json({
      ...ticket, id: ticket._id,
      emp_name: user?.name || 'Unknown',
      emp_email: user?.email || '',
      emp_code: user?.emp_id || '',
      department: user?.department || 'N/A',
      phone: user?.phone || '',
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
      logs: ticket.logs || []   // ✅ hardcode [] instead of ticket.logs போட்டிருந்தோம் — இப்போ fix
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// UPDATE TICKET ✅ ONLY ONE
// ======================================
// ======================================
// UPDATE TICKET ✅ ONLY ONE
// ======================================
router.patch('/:id', auth, async (req, res) => {
  try {
    const { status, note } = req.body;

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      {
        $set: { status },
        $push: {
          logs: {
            status: status || 'updated',
            note: note?.trim() || '',
            date: new Date(),
            by: req.user?.name || 'IT Support'
          }
        }
      },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    if (status) {
      await Notification.create({
        message: `Your ticket "${ticket.subject}" status updated to "${status}"`,
        type: 'ticket_updated',
        role: 'employee',
        ticket_id: ticket._id,
        user_id: ticket.created_by,
      });
    }

    res.json({ success: true, ticket });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});
// ======================================
// DELETE TICKET
// ======================================
router.delete('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;