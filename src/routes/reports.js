const router = require('express').Router();

router.get('/', async (req, res) => {
  try {
    console.log("REPORTS API HIT");

    res.json({
      totalTickets: 0,
      closed: 0,
      open: 0
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;