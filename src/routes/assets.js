const router = require('express').Router();
const Asset = require('../models/Asset');
const Employee = require('../models/User');
const jwt = require('jsonwebtoken');

// ✅ MY ASSETS - must be before /:id
router.get('/my-assets', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token' });
    const token = header.split(' ')[1];
    const user = jwt.verify(token, 'secret');
    const assets = await Asset.find({ assigned_to: user.id }).lean();
    res.json(assets);
  } catch (err) {
    console.error('MY ASSETS ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET all assets
router.get('/', async (req, res) => {
  try {
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = req.query.q;
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { asset_code: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } },
        { model: { $regex: q, $options: 'i' } },
        { assigned_to_name: { $regex: q, $options: 'i' } }
      ];
    }
    const assets = await Asset.find(filter).sort({ createdAt: -1 });
    const allAssets = await Asset.find({});
    const stats = {
      total: allAssets.length,
      available: allAssets.filter(a => a.status === 'Available').length,
      assigned: allAssets.filter(a => a.status === 'Assigned').length,
      repair: allAssets.filter(a => a.status === 'Under Repair' || a.status === 'Damaged').length
    };
    res.json({ assets, stats });
  } catch (err) {
    console.error('GET /assets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ADD new asset
router.post('/', async (req, res) => {
  try {
    const existing = await Asset.findOne({ asset_code: req.body.asset_code });
    if (existing) return res.status(400).json({ error: 'Asset code already exists' });
    const asset = new Asset({
      ...req.body,
      assigned_to: null,
      assigned_to_name: null,
      assigned_date: null
    });
    await asset.save();
    res.json({ success: true, asset });
  } catch (err) {
    console.error('POST /assets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ASSIGN asset to employee
router.patch('/:id/assign', async (req, res) => {
  try {
    const { employee_id } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'Employee ID is required' });
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (asset.status === 'Assigned') return res.status(400).json({ error: 'Asset is already assigned. Unassign it first.' });
    const employee = await Employee.findById(employee_id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const empName = employee.name || employee.email;
    asset.status = 'Assigned';
    asset.assigned_to = employee_id;
    asset.assigned_to_name = empName;
    asset.assigned_date = new Date();
    await asset.save();
    res.json({ success: true, message: `Asset assigned to ${empName}`, asset });
  } catch (err) {
    console.error('ASSIGN error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ UNASSIGN asset
router.patch('/:id/unassign', async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    asset.status = 'Available';
    asset.assigned_to = null;
    asset.assigned_to_name = null;
    asset.assigned_date = null;
    await asset.save();
    res.json({ success: true, message: 'Asset unassigned successfully', asset });
  } catch (err) {
    console.error('UNASSIGN error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ UPDATE asset
router.patch('/:id', async (req, res) => {
  try {
    const asset = await Asset.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, asset });
  } catch (err) {
    console.error('PATCH /assets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ DELETE asset
router.delete('/:id', async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, message: 'Asset deleted' });
  } catch (err) {
    console.error('DELETE /assets error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;