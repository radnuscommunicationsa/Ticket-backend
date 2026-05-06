const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
  asset_code: { type: String, required: true, unique: true },
  name: String,
  brand: String,
  model: String,
  status: { type: String, default: 'Available' },

  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null
  },

  assigned_to_name: String,
  assigned_date: Date

}, { timestamps: true });

module.exports = mongoose.model('Asset', AssetSchema);