const mongoose = require('mongoose');

const PaymentOrderSchema = mongoose.Schema({
  orderCode: {
    type: Number,
    required: true,
    unique: true
  },
  provider: {
    type: String,
    enum: ['payos', 'free'],
    default: 'payos'
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled', 'failed'],
    default: 'pending'
  },
  idUser: {
    type: mongoose.Schema.ObjectId,
    ref: 'localusers',
    required: true
  },
  idCourse: {
    type: mongoose.Schema.ObjectId,
    ref: 'courses',
    required: true
  },
  courseName: {
    type: String,
    required: true
  },
  courseType: {
    type: String,
    enum: ['session', 'hour'],
    default: 'session'
  },
  hoursPurchased: {
    type: Number,
    default: 0
  },
  originalAmount: {
    type: Number,
    default: 0
  },
  amount: {
    type: Number,
    required: true
  },
  discountCode: {
    type: String,
    default: ''
  },
  discountPercent: {
    type: Number,
    default: 0
  },
  paymentLinkId: {
    type: String,
    default: ''
  },
  checkoutUrl: {
    type: String,
    default: ''
  },
  paidAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  rawProviderData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

PaymentOrderSchema.index({ idUser: 1, idCourse: 1, status: 1 });
PaymentOrderSchema.index({ idUser: 1, createdAt: -1 });

const PaymentOrder = mongoose.models.paymentorders || mongoose.model('paymentorders', PaymentOrderSchema);

module.exports = PaymentOrder;
