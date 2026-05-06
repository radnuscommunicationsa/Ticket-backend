const router = require('express').Router();
const User = require('../models/User');

// ✅ GET all employees and admins
router.get('/', async (req, res) => {
  try {
    const employees = await User.find({ role: 'employee' })
      .select('-password')
      .sort({ name: 1 });
    const admins = await User.find({ role: 'admin' })
      .select('-password')
      .sort({ name: 1 });
    res.json({ employees, admins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ ADD employee
router.post('/', async (req, res) => {
  try {
    const { name, emp_id, email, password, department, phone, role } = req.body;
    if (!name || !emp_id || !email || !password)
      return res.status(400).json({ error: 'Name, ID, email and password are required' });

    const existing = await User.findOne({ $or: [{ email }, { emp_id }] });
    if (existing)
      return res.status(400).json({ error: 'Email or Employee ID already exists' });

    const user = new User({
      name,
      emp_id,
      email,
      password,
      department: department || '',
      phone: phone || '',
      role: role || 'employee',
      status: 'active'
    });
    await user.save();
    res.json({ success: true, employee: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ UPDATE employee
router.patch('/:id', async (req, res) => {
  try {
    const { new_password, ...fields } = req.body;
    if (new_password && new_password.trim() !== '') {
      fields.password = new_password;
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true, employee: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ DELETE employee
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;