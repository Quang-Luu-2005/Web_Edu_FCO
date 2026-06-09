const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'localusers',
    default: null
  },
  pageUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  errorType: {
    type: String,
    default: 'unknown',
    trim: true,
    maxlength: 50
  },
  message: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  userAgent: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  ip: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  },
  status: {
    type: String,
    enum: ['pending', 'read', 'resolved'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  readAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'localusers',
    default: null
  }
});

const SupportTicket = mongoose.models.supporttickets
  || mongoose.model('supporttickets', SupportTicketSchema);

module.exports = SupportTicket;
