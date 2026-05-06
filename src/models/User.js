const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  emp_id:     { type: String, required: true, unique: true },
  name:       { type: String, default: '' },
  email:      { type: String, required: true, unique: true },
  password:   { type: String, required: true },
  role: {
  type: String,
  enum: ['employee', 'admin', 'system_admin'],
  default: 'employee'
},
  department: { type: String, default: '' },
  phone:      { type: String, default: '' },
  status:     { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);