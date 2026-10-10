const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
  asset_code: { type: String, required: true, unique: true },
  name: String,
  brand: String,
  model: String,
  category: String,
  serial_no: String,
  purchase_date: Date,
  warranty_until: Date,
  location: String,
  notes: String,
  status: { type: String, default: 'Available' },

  // SIM Card
  sim_number: { type: String, trim: true, default: '' },
  sim_provider: { type: String, trim: true, default: '' },

  // Category-specific details (IMEI, RAM, Storage, MAC, IP ...)
  specs: { type: mongoose.Schema.Types.Mixed, default: {} },

  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assigned_to_name: String,
  assigned_date: Date
}, { timestamps: true });

module.exports = mongoose.model('Asset', AssetSchema);