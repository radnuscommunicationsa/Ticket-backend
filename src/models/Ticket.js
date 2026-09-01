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

    // ✅ NEW — stores the uploaded file's filename on disk
    attachment: {
      type: String,
      default: null,
    },

    contact_pref: {
      type: String,
      enum: ['Email', 'Phone', 'Slack', 'In-Person'],
      default: 'Email',
    },

    // how this ticket came in
    source: {
      type: String,
      enum: ['web', 'phone', 'walk-in', 'email'],
      default: 'web',
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // set only when an admin raises this ticket on behalf of an employee
    raised_by_admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    resolved_at: {
      type: Date,
      default: null,
    },

    logs: [
      {
        status: { type: String },
        note:   { type: String },
        date:   { type: Date, default: Date.now },
        by:     { type: String }
      }
    ],

    comments: [
      {
        message:      { type: String, required: true },
        by:           { type: String },
        by_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        by_role:      { type: String, enum: ['admin', 'employee'], default: 'employee' },
        created_at:   { type: Date, default: Date.now }
      }
    ],

    feedback: {
      rating:      { type: Number, min: 1, max: 5, default: null },
      comment:     { type: String, default: '' },
      submitted_at:{ type: Date, default: null }
    },

  },

  {
    timestamps: true,
    strictPopulate: false,
  }
);

module.exports = mongoose.model('Ticket', ticketSchema);