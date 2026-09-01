const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: [
        'ticket_created',
        'ticket_updated',
        'asset_assigned',
        'take_home_request',
        'take_home_status',
        'general',
      ],
      default: 'general',
    },

    role: {
      type: String,
      enum: ['admin', 'employee', 'all'],
      default: 'all',
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    ticket_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      default: null,
    },

    // NEW — lets the employee notifications page show/link the ticket number
    // without an extra DB lookup
    ticket_no: {
      type: String,
      default: null,
    },

    is_read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', notificationSchema);