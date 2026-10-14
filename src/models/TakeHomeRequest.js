const mongoose = require('mongoose');

const TakeHomeRequestSchema = new mongoose.Schema(
  {
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    asset_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
      index: true,
    },
    asset_type: String,

    reason: { type: String, required: true },
    from_date: { type: Date, required: true },
    to_date: { type: Date, required: true },
    is_permanent: { type: Boolean, default: false },

    emergency_contact: String,
    emergency_phone: { type: String, required: true },

    status: {
      type: String,
      enum: ['pending', 'approved_by_manager', 'approved', 'rejected', 'returned'],
      default: 'pending',
      index: true,
    },
    notes: String,
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

module.exports =
  mongoose.models.TakeHomeRequest ||
  mongoose.model('TakeHomeRequest', TakeHomeRequestSchema);