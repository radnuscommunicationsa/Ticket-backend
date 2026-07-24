const router = require('express').Router();
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

router.get('/', async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'year and month are required' });
    }

    // Date range for the selected month
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    // ── Ticket Summary ────────────────────────────────────────────
    const [total, open_c, inprog, resolved, closed] = await Promise.all([
      Ticket.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Ticket.countDocuments({ createdAt: { $gte: start, $lt: end }, status: 'open' }),
      Ticket.countDocuments({ createdAt: { $gte: start, $lt: end }, status: 'in_progress' }),
      Ticket.countDocuments({ createdAt: { $gte: start, $lt: end }, status: 'resolved' }),
      Ticket.countDocuments({ createdAt: { $gte: start, $lt: end }, status: 'closed' }),
    ]);

    // ── Employee Activity ─────────────────────────────────────────
    const employees = await User.find({ role: 'employee' }).lean();

    const empData = await Promise.all(
      employees.map(async (u) => {
        const [empTotal, empOpen, empResolved] = await Promise.all([
          Ticket.countDocuments({ assigned_to: u._id, createdAt: { $gte: start, $lt: end } }),
          Ticket.countDocuments({ assigned_to: u._id, createdAt: { $gte: start, $lt: end }, status: 'open' }),
          Ticket.countDocuments({ assigned_to: u._id, createdAt: { $gte: start, $lt: end }, status: 'resolved' }),
        ]);
        return {
          name:       u.name,
          department: u.department ?? '—',
          total:      empTotal,
          open:       empOpen,
          resolved:   empResolved,
        };
      })
    );

    // ── Asset Overview ────────────────────────────────────────────
    const [assetTotal, assetAvailable, assetAssigned] = await Promise.all([
      Asset.countDocuments({}),
      Asset.countDocuments({ status: 'available' }),
      Asset.countDocuments({ status: 'assigned' }),
    ]);

    res.json({
      tkt:       { total, open_c, inprog, resolved, closed },
      empData:   empData.sort((a, b) => b.total - a.total),
      assetData: { total: assetTotal, available: assetAvailable, assigned: assetAssigned },
    });

  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;