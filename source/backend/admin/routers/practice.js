const express = require('express');
const router  = express.Router();
const PracticeClass = require('../../models/PracticeClass.model');
const LocalUser     = require('../../models/LocalUser.model');
const { ensureAuthenticated } = require('../config/auth_admin');
const {
  is2MStudent,
  isPracticeStudent,
  getUser2MCourses,
  getRankLabel,
  RANK_LEVELS
} = require('../../config/practice.config');

// ── Danh sách lớp thực hành ──
router.get('/', ensureAuthenticated, async (req, res) => {
  const classes = await PracticeClass.find({})
    .populate('idLecturer', 'name avatar')
    .sort({ createdAt: -1 });

  // Đếm tổng học viên (đã đăng ký thành công) và buổi
  const stats = classes.map(cls => {
    const totalSessions = cls.sessions.length;
    const totalEnrollments = cls.sessions.reduce((acc, s) => {
      return acc + s.enrollments.filter(e => e.paymentStatus === 'paid' || e.paymentStatus === 'free').length;
    }, 0);
    return { cls, totalSessions, totalEnrollments };
  });

  res.locals.layout = false;
  res.render('admin/practice/practiceList', {
    user: req.user,
    data: { title: 'Lớp thực hành', stats }
  });
});

// ── Form tạo lớp mới ──
router.get('/new', ensureAuthenticated, async (req, res) => {
  const lecturers = await LocalUser.find({ role: 'lecturer' }, 'name email avatar');
  res.locals.layout = false;
  res.render('admin/practice/practiceForm', {
    user: req.user,
    data: { title: 'Tạo lớp thực hành', cls: null, lecturers, isNew: true }
  });
});

router.post('/new', ensureAuthenticated, express.urlencoded({ extended: true }), async (req, res) => {
  const { name, description, poster, pricePerSession, maxStudentsPerSession, idLecturer, status } = req.body;
  const cls = new PracticeClass({
    name:                  (name || 'Lớp thực hành').trim(),
    description:           (description || '').trim(),
    poster:                (poster || '').trim() || undefined,
    pricePerSession:       Number(pricePerSession) || 50000,
    maxStudentsPerSession: Number(maxStudentsPerSession) || 10,
    idLecturer:            idLecturer || null,
    status:                status === 'closed' ? 'closed' : 'active'
  });
  await cls.save();
  res.redirect('/admin/practice/' + cls._id);
});

// ── Suggest user theo email/username (chỉ học viên 2M cho session) ──
router.get('/users/suggest-2m', ensureAuthenticated, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const safe = q.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const fuzzyRe = new RegExp(safe.join('.*'), 'i');

    const filter = {
      $and: [
        { $or: [{ role: 'user' }, { role: 'guest' }, { role: null }, { role: { $exists: false } }] },
        { $or: [{ email: fuzzyRe }, { username: fuzzyRe }, { name: fuzzyRe }] }
      ]
    };

    const users = await LocalUser.find(filter, 'name username email avatar role purchasedCourses').limit(30);

    // Check 2M cho từng user
    const result = [];
    for (const u of users) {
      const courses2M = await getUser2MCourses(u);
      result.push({
        _id:      u._id,
        name:     u.name,
        username: u.username,
        email:    u.email,
        avatar:   u.avatar,
        is2M:     courses2M.length > 0,
        courses2MNames: courses2M.map(c => c.name)
      });
    }

    // Sort: 2M lên đầu
    result.sort((a, b) => (b.is2M ? 1 : 0) - (a.is2M ? 1 : 0));
    return res.json(result.slice(0, 8));
  } catch (err) {
    console.error('[practice/suggest-2m] error:', err.message);
    return res.json([]);
  }
});

// ── Chi tiết lớp ──
router.get('/:id', ensureAuthenticated, async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.redirect('/admin/practice');

  const cls = await PracticeClass.findById(req.params.id)
    .populate('idLecturer', 'name avatar email')
    .populate('sessions.enrollments.idUser', 'name avatar username email purchasedCourses zaloPhone inGameName rank');

  if (!cls) return res.redirect('/admin/practice');

  const lecturers = await LocalUser.find({ role: 'lecturer' }, 'name email avatar');

  // Sort sessions theo ngày
  cls.sessions.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : Infinity;
    const db = b.date ? new Date(b.date).getTime() : Infinity;
    return da - db;
  });

  // Đếm số yêu cầu đang chờ duyệt (toàn bộ lớp)
  let pendingCount = 0;
  cls.sessions.forEach(s => {
    pendingCount += (s.enrollments || []).filter(e => e.paymentStatus === 'requested').length;
  });

  res.locals.layout = false;
  res.render('admin/practice/practiceDetail', {
    user: req.user,
    data: { title: cls.name, cls, lecturers, pendingCount, getRankLabel, rankLevels: RANK_LEVELS }
  });
});

// ── Cập nhật thông tin lớp ──
router.post('/:id/update', ensureAuthenticated, express.urlencoded({ extended: true }), async (req, res) => {
  const { name, description, poster, pricePerSession, maxStudentsPerSession, idLecturer, status } = req.body;
  const update = {
    name:                  (name || '').trim(),
    description:           (description || '').trim(),
    poster:                (poster || '').trim() || undefined,
    pricePerSession:       Number(pricePerSession) || 50000,
    maxStudentsPerSession: Number(maxStudentsPerSession) || 10,
    status:                status === 'closed' ? 'closed' : 'active'
  };
  if (idLecturer) update.idLecturer = idLecturer;
  await PracticeClass.findByIdAndUpdate(req.params.id, { $set: update });
  res.redirect('/admin/practice/' + req.params.id);
});

// ── Xóa lớp ──
router.post('/:id/delete', ensureAuthenticated, async (req, res) => {
  await PracticeClass.findByIdAndDelete(req.params.id);
  return res.json({ ok: true });
});

// ── Thêm buổi học ──
router.post('/:id/sessions/add', ensureAuthenticated, express.json(), async (req, res) => {
  const { title, date, endTime, meetLink, location, note } = req.body;
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false, msg: 'Không tìm thấy lớp' });

  cls.sessions.push({
    title:    (title    || '').trim(),
    date:     date ? new Date(date) : null,
    endTime:  (endTime  || '').trim(),
    meetLink: (meetLink || '').trim(),
    location: (location || '').trim(),
    note:     (note     || '').trim(),
    status:   'scheduled',
    enrollments: []
  });
  await cls.save();
  return res.json({ ok: true, session: cls.sessions[cls.sessions.length - 1] });
});

// ── Cập nhật buổi học ──
router.post('/:id/sessions/:sid/update', ensureAuthenticated, express.json(), async (req, res) => {
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false });

  const { title, date, endTime, meetLink, zaloGroupLink, location, note, status } = req.body;
  if (title         !== undefined) s.title         = title;
  if (date          !== undefined) s.date          = date ? new Date(date) : null;
  if (endTime       !== undefined) s.endTime       = endTime;
  if (meetLink      !== undefined) s.meetLink      = meetLink;
  if (zaloGroupLink !== undefined) s.zaloGroupLink = (zaloGroupLink || '').trim();
  if (location      !== undefined) s.location      = location;
  if (note          !== undefined) s.note          = note;
  if (status        !== undefined) s.status        = status;
  await cls.save();
  return res.json({ ok: true, session: s });
});

// ── Cập nhật bracket cho buổi ──
router.post('/:id/sessions/:sid/bracket', ensureAuthenticated, express.json(), async (req, res) => {
  const { pairs } = req.body;
  if (!Array.isArray(pairs)) return res.json({ ok: false, msg: 'Dữ liệu không hợp lệ' });

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false });

  // Chỉ chấp nhận user đã được duyệt (paid/free/approved)
  const allowedIds = new Set(
    s.enrollments
      .filter(e => ['paid', 'free', 'approved'].includes(e.paymentStatus))
      .map(e => e.idUser && e.idUser.toString())
      .filter(Boolean)
  );

  const cleaned = [];
  for (const p of pairs) {
    const p1 = p && p.player1 ? String(p.player1) : null;
    const p2 = p && p.player2 ? String(p.player2) : null;
    if (p1 && !allowedIds.has(p1)) return res.json({ ok: false, msg: 'Có học viên chưa được duyệt trong nhánh đấu' });
    if (p2 && !allowedIds.has(p2)) return res.json({ ok: false, msg: 'Có học viên chưa được duyệt trong nhánh đấu' });
    if (p1 || p2) cleaned.push({ player1: p1 || null, player2: p2 || null });
  }

  s.bracket = cleaned;
  await cls.save();
  return res.json({ ok: true, bracket: s.bracket });
});

// ── Xóa buổi học ──
router.post('/:id/sessions/:sid/delete', ensureAuthenticated, async (req, res) => {
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  cls.sessions.pull({ _id: req.params.sid });
  await cls.save();
  return res.json({ ok: true });
});

// ── Admin: thêm học viên 2M vào buổi (miễn phí, status=free) ──
router.post('/:id/sessions/:sid/enroll-2m', ensureAuthenticated, express.json(), async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ ok: false, msg: 'Thiếu userId' });

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false, msg: 'Không tìm thấy lớp' });

  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false, msg: 'Không tìm thấy buổi học' });

  const user = await LocalUser.findById(userId);
  if (!user) return res.json({ ok: false, msg: 'Không tìm thấy người dùng' });

  // Verify user là 2M
  const courses2M = await getUser2MCourses(user);
  if (courses2M.length === 0) {
    return res.json({ ok: false, msg: 'Người này không phải học viên khóa 2M' });
  }

  // Check đã có chưa
  const already = s.enrollments.some(e => e.idUser && e.idUser.toString() === userId.toString());
  if (already) return res.json({ ok: false, msg: 'Học viên đã có trong buổi này' });

  // Check chỗ — chỉ đếm những người đã được chọn (paid/free/approved), không đếm 'requested'
  const activeCount = s.enrollments.filter(e => ['paid', 'free', 'approved'].includes(e.paymentStatus)).length;
  if (activeCount >= cls.maxStudentsPerSession) {
    return res.json({ ok: false, msg: `Buổi học đã đủ ${cls.maxStudentsPerSession} học viên được chọn` });
  }

  s.enrollments.push({
    idUser:        user._id,
    type:          '2M',
    paymentStatus: 'free',
    orderCode:     null,
    amount:        0,
    enrolledAt:    new Date(),
    reviewedAt:    new Date(),
    snapshotZaloPhone:  user.zaloPhone || '',
    snapshotInGameName: user.inGameName || '',
    snapshotRank:       user.rank || ''
  });
  await cls.save();

  return res.json({
    ok: true,
    student: {
      _id:      user._id,
      name:     user.name,
      username: user.username,
      email:    user.email,
      avatar:   user.avatar,
      type:     '2M'
    }
  });
});

// ── Admin: duyệt yêu cầu — type 2M chuyển thành 'free', type paid chuyển thành 'approved' ──
router.post('/:id/sessions/:sid/approve', ensureAuthenticated, express.json(), async (req, res) => {
  const { userId, adminNote } = req.body;
  if (!userId) return res.json({ ok: false, msg: 'Thiếu userId' });

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false });

  const en = s.enrollments.find(e => e.idUser && e.idUser.toString() === userId.toString());
  if (!en) return res.json({ ok: false, msg: 'Không tìm thấy yêu cầu' });
  if (en.paymentStatus !== 'requested') {
    return res.json({ ok: false, msg: 'Yêu cầu này không ở trạng thái chờ duyệt' });
  }

  const enrolledUser = await LocalUser.findById(userId);
  if (!enrolledUser) return res.json({ ok: false, msg: 'Không tìm thấy người dùng' });
  const isStudent = await isPracticeStudent(enrolledUser);

  // Check chỗ
  const activeCount = s.enrollments.filter(e => ['paid', 'free', 'approved'].includes(e.paymentStatus)).length;
  if (activeCount >= cls.maxStudentsPerSession) {
    return res.json({ ok: false, msg: `Buổi học đã đủ ${cls.maxStudentsPerSession} học viên` });
  }

  en.type = en.type === '2M' ? '2M' : (isStudent ? 'student' : 'paid');
  en.paymentStatus = isStudent ? 'free' : 'approved';
  en.amount = isStudent ? 0 : (en.amount || cls.pricePerSession || 50000);
  en.reviewedAt = new Date();
  if (typeof adminNote === 'string') en.adminNote = adminNote.trim().slice(0, 300);
  await cls.save();

  return res.json({ ok: true, paymentStatus: en.paymentStatus, type: en.type, amount: en.amount });
});

// ── Admin: từ chối yêu cầu ──
router.post('/:id/sessions/:sid/reject', ensureAuthenticated, express.json(), async (req, res) => {
  const { userId, adminNote } = req.body;
  if (!userId) return res.json({ ok: false, msg: 'Thiếu userId' });

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false });

  const en = s.enrollments.find(e => e.idUser && e.idUser.toString() === userId.toString());
  if (!en) return res.json({ ok: false, msg: 'Không tìm thấy yêu cầu' });
  if (en.paymentStatus !== 'requested') {
    return res.json({ ok: false, msg: 'Yêu cầu này không ở trạng thái chờ duyệt' });
  }

  en.paymentStatus = 'rejected';
  en.reviewedAt = new Date();
  if (typeof adminNote === 'string') en.adminNote = adminNote.trim().slice(0, 300);
  await cls.save();

  return res.json({ ok: true });
});

// ── Xóa học viên khỏi buổi ──
router.post('/:id/sessions/:sid/unenroll', ensureAuthenticated, express.json(), async (req, res) => {
  const { userId } = req.body;
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false });
  s.enrollments = s.enrollments.filter(e => !(e.idUser && e.idUser.toString() === userId.toString()));
  await cls.save();
  return res.json({ ok: true });
});

// ── Toggle attended ──
router.post('/:id/sessions/:sid/attendance', ensureAuthenticated, express.json(), async (req, res) => {
  const { userId, attended } = req.body;
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false });
  const en = s.enrollments.find(e => e.idUser && e.idUser.toString() === userId.toString());
  if (!en) return res.json({ ok: false, msg: 'Không có học viên này' });
  en.attended = !!attended;
  await cls.save();
  return res.json({ ok: true });
});

module.exports = router;
