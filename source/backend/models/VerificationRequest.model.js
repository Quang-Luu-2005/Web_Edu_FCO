const mongoose = require('mongoose');

// Trạng thái: pending → approved / rejected
const VerificationRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'localusers',
    required: true
  },
  // URL ảnh minh chứng (upload lên ImgBB từ browser)
  proofImageUrl: {
    type: String,
    required: true
  },
  note: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  adminNote: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  }
});

const VerificationRequest = mongoose.models.verificationrequests
  || mongoose.model('verificationrequests', VerificationRequestSchema);

module.exports = VerificationRequest;
