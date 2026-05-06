const router = require('express').Router();

// GET notifications
router.get('/', async (req, res) => {
  try {
    res.json([
      { id: 1, message: "New ticket created" },
      { id: 2, message: "Asset assigned" }
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ ADD THIS (IMPORTANT)
router.get('/read', async (req, res) => {
  try {
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
// ✅ MARK AS READ
router.patch('/read', async (req, res) => {
  try {
    // you can update DB later
    res.json({ success: true, message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});