const mongoose = require('mongoose');

const EnrollmentSchema = new mongoose.Schema({
  idUser:        { type: mongoose.Schema.ObjectId, ref: 'localusers', required: true },
  type:          { type: String, enum: ['2M', 'paid'], required: true },
  paymentStatus: { type: String, enum: ['requested', 'approved', 'paid', 'free', 'rejected', 'cancelled', 'pending'], default: 'requested' },
  orderCode:     { type: Number, default: null },
  amount:        { type: Number, default: 0 },
  enrolledAt:    { type: Date, default: Date.now },
  reviewedAt:    { type: Date, default: null },
  adminNote:     { type: String, default: '' },
  // Snapshot profile tại thời điểm request — lưu để admin xem dù sau này user đổi
  snapshotZaloPhone:  { type: String, default: '' },
  snapshotInGameName: { type: String, default: '' },
  snapshotRank:       { type: String, default: '' },
  attended:      { type: Boolean, default: false }
}, { _id: false });

const PracticeSessionSchema = new mongoose.Schema({
  title:      { type: String, default: '' },
  date:       { type: Date,   default: null },
  endTime:    { type: String, default: '' }, // HH:MM
  meetLink:   { type: String, default: '' },
  location:   { type: String, default: '' },
  note:       { type: String, default: '' },
  status:     { type: String, enum: ['scheduled', 'done', 'cancelled'], default: 'scheduled' },
  enrollments:{ type: [EnrollmentSchema], default: [] }
});

const PracticeClassSchema = new mongoose.Schema({
  name:                  { type: String, required: true },
  description:           { type: String, default: '' },
  poster:                { type: String, default: 'https://i.ibb.co/wr2CLVVd/default-poster.png' },
  pricePerSession:       { type: Number, default: 50000 },
  maxStudentsPerSession: { type: Number, default: 10 },
  idLecturer:            { type: mongoose.Schema.ObjectId, ref: 'localusers', default: null },
  status:                { type: String, enum: ['active', 'closed'], default: 'active' },
  sessions:              { type: [PracticeSessionSchema], default: [] },
  followers:             { type: [{ type: mongoose.Schema.ObjectId, ref: 'localusers' }], default: [] },
  createdAt:             { type: Date, default: Date.now }
});

const PracticeClass = mongoose.models.practiceclasses
  || mongoose.model('practiceclasses', PracticeClassSchema);

module.exports = PracticeClass;
