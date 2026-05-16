const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  sessionIndex: { type: Number, required: true },
  attended:     { type: Boolean, default: false },
  note:         { type: String, default: '' }
}, { _id: false });

const StudentSchema = new mongoose.Schema({
  idUser:     { type: mongoose.Schema.ObjectId, ref: 'localusers', required: true },
  enrolledAt: { type: Date, default: Date.now },
  attendance: { type: [AttendanceSchema], default: [] }
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  title:      { type: String, default: '' },
  date:       { type: Date,   default: null },
  meetLink:   { type: String, default: '' },   // link dạy trực tiếp
  recordLink: { type: String, default: '' },   // link video bài giảng
  note:       { type: String, default: '' },
  status:     { type: String, enum: ['scheduled','done','cancelled'], default: 'scheduled' }
});

const CourseClassSchema = new mongoose.Schema({
  idCourse:    { type: mongoose.Schema.ObjectId, ref: 'courses',    required: true },
  idLecturer:  { type: mongoose.Schema.ObjectId, ref: 'localusers', required: true },
  name:        { type: String, required: true },
  maxStudents: { type: Number, default: 10 },
  status:      { type: String, enum: ['open','ongoing','completed','cancelled'], default: 'open' },
  students:    { type: [StudentSchema], default: [] },
  sessions:    { type: [SessionSchema], default: [] },
  createdAt:   { type: Date, default: Date.now }
});

const CourseClass = mongoose.models.courseclasses
  || mongoose.model('courseclasses', CourseClassSchema);

module.exports = CourseClass;
