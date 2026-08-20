const mongoose = require('mongoose');

const takeHomeRequestSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  asset_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset',
    required: true
  },
  asset_type: {
    type: String,
    required: true,
    enum: ['laptop', 'mobile', 'tablet', 'monitor', 'other']
  },
  reason: {
    type: String,
    required: true,
    minlength: 10
  },
  from_date: {
    type: Date,
    required: true
  },
  to_date: {
    type: Date,
    required: true
  },
  emergency_contact: {
    type: String,
    default: ''
  },
  emergency_phone: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved_by_manager', 'approved', 'rejected', 'returned'],
    default: 'pending'
  },
  manager_approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  it_approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approved_at: {
    type: Date,
    default: null
  },
  returned_at: {
    type: Date,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TakeHomeRequest', takeHomeRequestSchema);