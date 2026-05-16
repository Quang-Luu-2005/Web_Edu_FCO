const express    = require('express');
const Router     = express.Router();
const CourseClass = require('../models/CourseClass.model');
const Course     = require('../models/Course.model');
const LocalUser  = require('../models/LocalUser.model');
const { ensureAuthenticated } = require('../config/auth.config');

// ── Học viên: xem lớp của mình ──
Router.get('/my-classes', ensureAuthenticated, async (req, res) => {
  const classes = await CourseClass.find({
    'students.idUser': req.user._id,
    status: { $ne: 'cancelled' }
  })
    .populate('idCourse', 'name poster')
    .populate('idLecturer', 'name avatar')
    .sort({ createdAt: -1 });

  return res.render('./classes/my-classes', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    classes
  });
});

// ── Học viên: xem chi tiết 1 lớp ──
Router.get('/my-classes/:classId', ensureAuthenticated, async (req, res) => {
  const cls = await CourseClass.findById(req.params.classId)
    .populate('idCourse', 'name poster')
    .populate('idLecturer', 'name avatar email')
    .populate('students.idUser', 'name avatar username email');

  if (!cls) return res.status(404).render('./error/404', { layout: false });

  // Kiểm tra học viên có trong lớp không
  const isMember = cls.students.some(s =>
    s.idUser && s.idUser._id.toString() === req.user._id.toString()
  );
  const isLecturer = cls.idLecturer &&
    cls.idLecturer._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isMember && !isLecturer && !isAdmin) {
    return res.render('./classes/not-enrolled', {
      isAuthenticated: req.isAuthenticated(),
      user: req.user,
      courseName: cls.idCourse ? cls.idCourse.name : 'khóa học này'
    });
  }

  // Tìm attendance của user hiện tại
  const myRecord = cls.students.find(s =>
    s.idUser && s.idUser._id.toString() === req.user._id.toString()
  );

  return res.render('./classes/class-detail', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    cls,
    isMember,
    isLecturer,
    isAdmin,
    myAttendance: myRecord ? myRecord.attendance : []
  });
});

module.exports = Router;
