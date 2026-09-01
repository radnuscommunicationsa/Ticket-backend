const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. 'ticket_no'
  seq: { type: Number, default: 1000 },
});

module.exports = mongoose.model('Counter', counterSchema);