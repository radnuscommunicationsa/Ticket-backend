const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    ticket_no: {
      type: String,
      unique: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      enum: [
        'Hardware Issue',
        'Software / Application',
        'Network / Connectivity',
        'Email / Communication',
        'Access / Permissions',
        'Password Reset',
        'New Equipment Request',
        'Security Incident',
        'Other',
      ],
      default: 'Other',
    },

    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },

    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
    },

    asset: {
      type: String,
      default: '',
    },

    contact_pref: {
      type: String,
      enum: ['Email', 'Phone', 'Slack', 'In-Person'],
      default: 'Email',
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',        // ✅ Fixed
      required: true,
    },

    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',        // ✅ Fixed, duplicate removed
      default: null,
    },

    resolved_at: {
      type: Date,
      default: null,
    },

    // ✅ ADD THIS
logs: [
  {
    status: { type: String },
    note:   { type: String },
    date:   { type: Date, default: Date.now },
    by:     { type: String }
  }
],

  },
  {
    timestamps: true,
    strictPopulate: false, // ✅ Added
  }
);

// Auto-generate ticket_no before saving
ticketSchema.pre('save', async function (next) {
  if (!this.ticket_no) {
    const count = await mongoose.model('Ticket').countDocuments();
    this.ticket_no = `TKT-${String(count + 1001).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema);