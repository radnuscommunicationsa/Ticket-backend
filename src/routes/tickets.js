const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Ticket = require('../models/Ticket');

const JWT_SECRET = "secret";

// ================================
// AUTH MIDDLEWARE
// ================================
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      error: 'No token'
    });
  }

  const token = header.split(' ')[1];

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({
      error: 'Invalid token'
    });
  }
}

// ================================
// GET /tickets/stats
// ================================
router.get('/stats', auth, async (req, res) => {
  try {

    const [
      total,
      open,
      critical,
      in_progress,
      resolved,
      closed,
      recent
    ] = await Promise.all([

      Ticket.countDocuments(),

      Ticket.countDocuments({
        status: 'open'
      }),

      Ticket.countDocuments({
        status: 'open',
        priority: 'critical'
      }),

      Ticket.countDocuments({
        status: 'in-progress'
      }),

      Ticket.countDocuments({
        status: 'resolved'
      }),

      Ticket.countDocuments({
        status: 'closed'
      }),

      Ticket.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()

    ]);

    const recent_tickets = recent.map(t => ({
      _id: t._id,
      id: t._id,

      ticket_no: t.ticket_no,
      subject: t.subject,
      priority: t.priority,
      status: t.status,
      category: t.category,

      emp_name: 'Employee',
      department: 'IT',

      created_at: t.createdAt
    }));

    res.json({
      total,
      open,
      critical,
      in_progress,
      resolved,
      closed,
      recent_tickets,
      recent_activity: []
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ================================
// GET /tickets/my-stats
// ================================
router.get('/my-stats', auth, async (req, res) => {

  try {

    const uid = req.user.id;

    const [
      total,
      open,
      in_progress,
      resolved,
      closed
    ] = await Promise.all([

      Ticket.countDocuments({
        created_by: uid
      }),

      Ticket.countDocuments({
        created_by: uid,
        status: 'open'
      }),

      Ticket.countDocuments({
        created_by: uid,
        status: 'in-progress'
      }),

      Ticket.countDocuments({
        created_by: uid,
        status: 'resolved'
      }),

      Ticket.countDocuments({
        created_by: uid,
        status: 'closed'
      })

    ]);

    res.json({
      total,
      open,
      in_progress,
      resolved,
      closed
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ================================
// GET /tickets/my-tickets
// ================================
router.get('/my-tickets', auth, async (req, res) => {

  try {

    const tickets = await Ticket.find({
      created_by: req.user.id
    })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = tickets.map(t => ({
      ...t,

      id: t._id,

      emp_name: 'Employee',
      department: 'IT',

      created_at: t.createdAt
    }));

    res.json(mapped);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
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

    const mapped = tickets.map(t => ({
      ...t,

      id: t._id,

      emp_name: 'Employee',
      department: 'IT',

      created_at: t.createdAt
    }));

    res.json(mapped);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ================================
// POST /tickets
// ================================
router.post('/', auth, async (req, res) => {

  try {

    const {
      category,
      priority,
      subject,
      description,
      asset,
      contact_pref
    } = req.body;

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

    res.json({
      success: true,
      ticket_no: ticket.ticket_no,
      ticket
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;