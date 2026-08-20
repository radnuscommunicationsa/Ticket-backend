const router = require('express').Router();
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

// ======================================
// GET /tickets/stats
// ======================================
router.get('/stats', auth, async (req, res) => {
  try {
    const [total, open, critical, in_progress, resolved, closed, recent, feedbackAgg] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'open' }),
      Ticket.countDocuments({ status: 'open', priority: 'critical' }),
      Ticket.countDocuments({ status: 'in-progress' }),
      Ticket.countDocuments({ status: 'resolved' }),
      Ticket.countDocuments({ status: 'closed' }),
      Ticket.find().sort({ createdAt: -1 }).limit(5).lean(),
      Ticket.aggregate([
        { $match: { 'feedback.submitted_at': { $ne: null } } },
        { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$feedback.rating' } } }
      ])
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
        created_at: t.createdAt,
        source: t.source || 'web'
      };
    });

    const feedbackStats = feedbackAgg[0] || { count: 0, avg: 0 };

    res.json({
      total, open, critical, in_progress, resolved, closed, recent_tickets, recent_activity: [],
      feedback_count: feedbackStats.count,
      avg_rating: parseFloat((feedbackStats.avg || 0).toFixed(1))
    });
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
      created_at: t.createdAt,
      source: t.source || 'web'
    }));
    res.json(mapped);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// GET /tickets — Admin All Tickets
// ======================================
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 }).lean();
    const userIds = tickets.map(t => t.created_by).filter(Boolean);
    const adminIds = tickets.map(t => t.raised_by_admin).filter(Boolean);
    const allIds = [...userIds, ...adminIds];

    const users = await User.find({ _id: { $in: allIds } }).lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const mapped = tickets.map(t => {
      const u = userMap[t.created_by?.toString()];
      const raisedByAdminUser = t.raised_by_admin ? userMap[t.raised_by_admin.toString()] : null;
      const hasFeedback = t.feedback && t.feedback.submitted_at != null;

      return {
        ...t, id: t._id,
        emp_name: u?.name || 'Unknown',
        emp_code: u?.emp_id || '',
        department: u?.department || 'N/A',
        created_at: t.createdAt,
        source: t.source || 'web',
        raised_by_admin_name: raisedByAdminUser?.name || null,
        has_feedback: hasFeedback,
        feedback_rating: hasFeedback ? t.feedback.rating : null,
        feedback_comment: hasFeedback ? t.feedback.comment : ''
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
// Supports:
//  - Normal self-raise (employee raises for themselves)
//  - Admin raising a ticket on behalf of an employee (phone/walk-in/email)
// ======================================
router.post('/', auth, async (req, res) => {
  try {
    const {
      category, priority, subject, description, asset, contact_pref,
      source, employee_id
    } = req.body;

    const ticket_no = `TKT-${Date.now()}`;

    const isAdminUser = req.user.role === 'admin' || req.user.role === 'system_admin';

    // Default: ticket belongs to whoever is logged in
    let created_by = req.user.id;
    let raised_by_admin = null;

    // If an admin selected an employee from the dropdown, the ticket belongs
    // to THAT employee instead, and we record which admin raised it.
    if (isAdminUser && employee_id) {
      created_by = employee_id;
      raised_by_admin = req.user.id;
    }

    const ticket = new Ticket({
      ticket_no, category, priority, subject,
      description, asset, contact_pref,
      source: source || 'web',
      created_by,
      raised_by_admin,
      status: 'open'
    });

    await ticket.save();

    // Notify admin
    await Notification.create({
      message: `New ticket ${ticket_no} raised: "${subject}" (${priority} priority)`,
      type: 'ticket_created',
      role: 'admin',
      ticket_id: ticket._id,
      user_id: created_by,
    });

    // Notify the employee the ticket belongs to
    await Notification.create({
      message: `Your ticket "${subject}" has been submitted successfully.`,
      type: 'ticket_created',
      role: 'employee',
      ticket_id: ticket._id,
      user_id: created_by,
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
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isOwner = ticket.created_by?.toString() === req.user.id;
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'system_admin';
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await User.findById(ticket.created_by).lean();
    const raisedByAdminUser = ticket.raised_by_admin
      ? await User.findById(ticket.raised_by_admin).lean()
      : null;

    res.json({
      ...ticket, id: ticket._id,
      emp_name: user?.name || 'Unknown',
      emp_email: user?.email || '',
      emp_code: user?.emp_id || '',
      department: user?.department || 'N/A',
      phone: user?.phone || '',
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
      logs: ticket.logs || [],
      comments: ticket.comments || [],
      source: ticket.source || 'web',
      raised_by_admin_name: raisedByAdminUser?.name || null
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

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
// ADD COMMENT TO TICKET
// ======================================
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Comment message is required' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isOwner = ticket.created_by?.toString() === req.user.id;
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'system_admin';
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const comment = {
      message: message.trim(),
      by: req.user.name || (isPrivileged ? 'IT Support' : 'Employee'),
      by_id: req.user.id,
      by_role: isPrivileged ? 'admin' : 'employee',
      created_at: new Date()
    };

    ticket.comments.push(comment);
    await ticket.save();

    if (isPrivileged) {
      await Notification.create({
        message: `New reply on your ticket "${ticket.subject}"`,
        type: 'ticket_updated',
        role: 'employee',
        ticket_id: ticket._id,
        user_id: ticket.created_by,
      });
    } else {
      await Notification.create({
        message: `New reply on ticket "${ticket.subject}"`,
        type: 'ticket_updated',
        role: 'admin',
        ticket_id: ticket._id,
        user_id: req.user.id,
      });
    }

    res.json({ success: true, comment, comments: ticket.comments });
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

// ======================================
// SUBMIT FEEDBACK
// ======================================
router.post('/:id/feedback', auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.created_by.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!['resolved', 'closed'].includes(ticket.status)) {
      return res.status(400).json({
        error: 'Feedback can only be submitted after resolution'
      });
    }

    ticket.feedback = {
      rating,
      comment: comment?.trim() || '',
      submitted_at: new Date()
    };

    await ticket.save();

    res.json({
      success: true,
      feedback: ticket.feedback
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// GET ALL FEEDBACK (admin only)
// ======================================
router.get('/feedback/all', auth, async (req, res) => {
  try {
    const tickets = await Ticket.find({ 'feedback.rating': { $ne: null } })
      .sort({ 'feedback.submitted_at': -1 })
      .lean();

    const userIds = tickets.map(t => t.created_by).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const feedbackList = tickets.map(t => {
      const u = userMap[t.created_by?.toString()];
      return {
        ticket_id: t._id,
        ticket_no: t.ticket_no,
        subject: t.subject,
        emp_name: u?.name || 'Unknown',
        department: u?.department || 'N/A',
        rating: t.feedback.rating,
        comment: t.feedback.comment,
        submitted_at: t.feedback.submitted_at
      };
    });

    const totalReviews = feedbackList.length;
    const avgRating = totalReviews > 0
      ? (feedbackList.reduce((sum, f) => sum + f.rating, 0) / totalReviews).toFixed(1)
      : 0;

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    feedbackList.forEach(f => { distribution[f.rating] = (distribution[f.rating] || 0) + 1; });

    res.json({
      feedbackList,
      totalReviews,
      avgRating: Number(avgRating),
      distribution
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;