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
  /* 🔥 KEY CHANGE 1: is_permanent field add panniruken */
  is_permanent: {
    type: Boolean,
    default: false
  },
  /* 🔥 KEY CHANGE 2: to_date required only when NOT permanent */
    is_permanent: {
    type: Boolean,
    default: false
  },
  to_date: {
    type: Date,
    required: function() {
      return this.is_permanent !== true;
    }
  },

  emergency_contact: {
    type: String,
    default: ''
  },
  emergency_phone: {
    type: String,
    required: true
  },
  /* 🔥 KEY CHANGE 3: 'permanent' status add panniruken */
    status: {
    type: String,
    enum: ['pending', 'approved_by_manager', 'approved', 'rejected', 'returned', 'permanent'],
    default: 'pending'
  },
  
  notes: {
    type: String,
    default: ''
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