const mongoose = require('mongoose');

const AssetHistorySchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', index: true },
  asset_code: { type: String, index: true },
  asset_name: String,

  action: {
    type: String,
    enum: ['Created', 'Assigned', 'Unassigned', 'Status Changed'],
    required: true,
  },

  // Saved as plain text too, so history survives even if the employee is deleted
  employee: { type: mongoose.Schema.Types.ObjectId, index: true },
  employee_name: String,

  reason: String,
  done_by: String,
  date: { type: Date, default: Date.now, index: true },
});

module.exports =
  mongoose.models.AssetHistory ||
  mongoose.model('AssetHistory', AssetHistorySchema);