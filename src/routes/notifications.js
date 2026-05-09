const router = require('express').Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// ======================================
// GET /notifications — get my notifications
// ======================================
router.get('/', auth, async (req, res) => {
  try {
    const { role, id } = req.user;

    const query = {
      $or: [
        { role: 'all' },
        { role: role },
        { user_id: id },
      ],
    };

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const unread_count = notifications.filter(n => !n.is_read).length;

    res.json({ notifications, unread_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// PATCH /notifications/read — mark all as read
// ======================================
router.patch('/read', auth, async (req, res) => {
  try {
    const { role, id } = req.user;

    await Notification.updateMany(
      {
        $or: [
          { role: 'all' },
          { role: role },
          { user_id: id },
        ],
        is_read: false,
      },
      { $set: { is_read: true } }
    );

    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;