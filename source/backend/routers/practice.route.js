const express = require('express');
const Router  = express.Router();
const { PayOS } = require('@payos/node');
const PracticeClass = require('../models/PracticeClass.model');
const LocalUser     = require('../models/LocalUser.model');
const { ensureAuthenticated } = require('../config/auth.config');
const { getPublicAppUrl } = require('../utils/publicAppUrl');
const {
  paymentLimiter,
  interactionLimiter,
  enrollmentLimiter,
} = require('../middlewares/rateLimit.mdw');
const {
  is2MStudent,
  isPracticeStudent,
  getUser2MCourses,
  isProfileCompleteForPractice,
  getRankLabel,
  RANK_LEVELS
} = require('../config/practice.config');

let _payos = null;
function getPayOS() {
  if (!_payos) {
    if (!process.env.PAYOS_CLIENT_ID || !process.env.PAYOS_API_KEY || !process.env.PAYOS_CHECKSUM_KEY) {
      throw new Error('PayOS credentials chưa được cấu hình trong .env');
    }
    _payos = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID,
      apiKey: process.env.PAYOS_API_KEY,
      checksumKey: process.env.PAYOS_CHECKSUM_KEY,
      partnerCode: process.env.PAYOS_PARTNER_CODE || undefined
    });
  }
  return _payos;
}

const renderNotFound    = (res) => res.status(404).render('./error/404', { layout: false });
const renderServerError = (res) => res.status(500).render('./error/500', { layout: false });

function findUserEnrollment(session, userId) {
  const userIdStr = userId && userId.toString();
  return (session.enrollments || []).find(e => e.idUser && e.idUser.toString() === userIdStr);
}

function rollbackPendingPracticePayment(en) {
  if (!en || en.paymentStatus !== 'pending') return false;
  en.paymentStatus = 'approved';
  en.orderCode = null;
  return true;
}

// Helper: build start of ISO week (Monday) for grouping — timezone-safe (local components)
function weekKeyOf(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // Sun=0 → 7
  d.setDate(d.getDate() - (day - 1)); // back to Monday
  d.setHours(0, 0, 0, 0);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Parse 'yyyy-mm-dd' as LOCAL midnight (avoid UTC shift)
function parseWeekKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ── Danh sách lớp thực hành ──
Router.get('/', async (req, res) => {
  const classes = await PracticeClass.find({ status: 'active' })
    .populate('idLecturer', 'name avatar')
    .sort({ createdAt: -1 });

  let userIs2M = false;
  let userIsPracticeStudent = false;
  let userActivity = {}; // { classId: { selected, pending, following } }
  if (req.isAuthenticated() && req.user) {
    userIs2M = await is2MStudent(req.user);
    userIsPracticeStudent = await isPracticeStudent(req.user);
    const uid = req.user._id.toString();
    classes.forEach(cls => {
      let selected = 0, pending = 0;
      (cls.sessions || []).forEach(s => {
        const en = (s.enrollments || []).find(e => e.idUser && e.idUser.toString() === uid);
        if (!en) return;
        if (['paid','free','approved'].includes(en.paymentStatus)) selected++;
        else if (en.paymentStatus === 'requested') pending++;
      });
      const following = (cls.followers || []).some(f => f && f.toString() === uid);
      if (selected || pending || following) {
        userActivity[cls._id.toString()] = { selected, pending, following };
      }
    });
  }

  return res.render('./practice/list', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    classes,
    userIs2M,
    userIsPracticeStudent,
    userActivity
  });
});

// ── Buổi thực hành của tôi ──
Router.get('/my', ensureAuthenticated, async (req, res) => {
  const userId = req.user._id.toString();
  const classes = await PracticeClass.find({
    'sessions.enrollments.idUser': req.user._id
  })
    .populate('idLecturer', 'name avatar')
    .sort({ createdAt: -1 });

  const items = [];
  classes.forEach(cls => {
    cls.sessions.forEach(s => {
      const en = s.enrollments.find(e => e.idUser && e.idUser.toString() === userId);
      if (en && en.paymentStatus !== 'cancelled') {
        items.push({
          classId:    cls._id,
          className:  cls.name,
          lecturer:   cls.idLecturer,
          poster:     cls.poster,
          pricePerSession: cls.pricePerSession,
          session:    s,
          enrollment: en
        });
      }
    });
  });

  items.sort((a, b) => {
    const da = a.session.date ? new Date(a.session.date).getTime() : 0;
    const db = b.session.date ? new Date(b.session.date).getTime() : 0;
    return db - da;
  });

  const userIs2M = await is2MStudent(req.user);
  const userIsPracticeStudent = await isPracticeStudent(req.user);

  return res.render('./practice/my-practice', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    items,
    userIs2M,
    userIsPracticeStudent,
    getRankLabel
  });
});

// ── Notifications: list unread ──
Router.get('/notifications', ensureAuthenticated, async (req, res) => {
  const userId = req.user._id.toString();
  const classes = await PracticeClass.find({ 'sessions.enrollments.idUser': req.user._id });

  const notifs = [];
  classes.forEach(cls => {
    cls.sessions.forEach(s => {
      const en = (s.enrollments || []).find(e => e.idUser && e.idUser.toString() === userId);
      if (!en) return;
      // Notify khi admin đã review (approved/rejected/free) và user chưa thấy
      if (!en.notifSeen && en.reviewedAt && ['free','approved','rejected'].includes(en.paymentStatus)) {
        notifs.push({
          classId:   cls._id.toString(),
          className: cls.name,
          sessionId: s._id.toString(),
          sessionTitle: s.title || 'Buổi thực hành',
          sessionDate:  s.date,
          status:    en.paymentStatus,
          adminNote: en.adminNote || '',
          reviewedAt: en.reviewedAt
        });
      }
    });
  });

  notifs.sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
  return res.json({ ok: true, notifications: notifs, unreadCount: notifs.length });
});

// ── Notifications: mark all as seen ──
Router.post('/notifications/seen', ensureAuthenticated, interactionLimiter, express.json(), async (req, res) => {
  const userId = req.user._id.toString();
  const classes = await PracticeClass.find({ 'sessions.enrollments.idUser': req.user._id });

  let updated = 0;
  for (const cls of classes) {
    let dirty = false;
    cls.sessions.forEach(s => {
      (s.enrollments || []).forEach(en => {
        if (en.idUser && en.idUser.toString() === userId && !en.notifSeen && en.reviewedAt) {
          en.notifSeen = true;
          dirty = true;
          updated++;
        }
      });
    });
    if (dirty) await cls.save();
  }
  return res.json({ ok: true, updated });
});

// ── Bracket view (chỉ user đã đăng ký buổi này — mọi trạng thái) ──
Router.get('/:id/sessions/:sid/bracket', ensureAuthenticated, async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return renderNotFound(res);

  const cls = await PracticeClass.findById(req.params.id)
    .populate('idLecturer', 'name avatar')
    .populate('sessions.enrollments.idUser', 'name username avatar inGameName rank')
    .populate('sessions.bracket.player1', 'name username avatar inGameName rank')
    .populate('sessions.bracket.player2', 'name username avatar inGameName rank');
  if (!cls) return renderNotFound(res);

  const s = cls.sessions.id(req.params.sid);
  if (!s) return renderNotFound(res);

  const userIdStr = req.user._id.toString();
  const myEn = (s.enrollments || []).find(e => e.idUser && e.idUser._id && e.idUser._id.toString() === userIdStr);
  if (!myEn) {
    req.flash && req.flash('error_msg', 'Bạn chưa đăng ký buổi này');
    return res.redirect('/practice/' + cls._id);
  }

  const userIsStudent = await isPracticeStudent(req.user);
  if (userIsStudent && myEn.paymentStatus === 'approved') {
    myEn.type = myEn.type === '2M' ? '2M' : 'student';
    myEn.paymentStatus = 'free';
    myEn.amount = 0;
    myEn.orderCode = null;
    myEn.reviewedAt = myEn.reviewedAt || new Date();
    await cls.save();
  }

  // Quyền xem Zalo: chỉ người đã hoàn tất quyền tham gia mới được thấy.
  // - paid: người trả phí đã thanh toán xong
  // - free: học viên được miễn phí sau khi admin duyệt
  // Không bao gồm approved vì trạng thái này với người trả phí là "đã duyệt nhưng chưa thanh toán".
  const canSeeZalo = ['paid', 'free'].includes(myEn.paymentStatus);
  const isApproved = canSeeZalo;

  return res.render('./practice/bracket', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    cls,
    session: s,
    myEnrollment: myEn,
    canSeeZalo,
    isApproved,
    getRankLabel
  });
});

// ── Chi tiết 1 lớp thực hành — danh sách buổi flat + follow ──
Router.get('/:id', async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return renderNotFound(res);
  }

  const cls = await PracticeClass.findById(req.params.id)
    .populate('idLecturer', 'name avatar email');
  if (!cls) return renderNotFound(res);

  let userIs2M = false;
  let userIsPracticeStudent = false;
  let userId = null;
  let profileComplete = false;
  let isFollowing = false;
  if (req.isAuthenticated() && req.user) {
    userIs2M = await is2MStudent(req.user);
    userIsPracticeStudent = await isPracticeStudent(req.user);
    userId = req.user._id.toString();
    profileComplete = isProfileCompleteForPractice(req.user);
    isFollowing = (cls.followers || []).some(f => f && f.toString() === userId);
  }

  const followerCount = (cls.followers || []).length;

  // Sort sessions theo ngày
  const sessionsAll = cls.sessions.slice().sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : Infinity;
    const db = b.date ? new Date(b.date).getTime() : Infinity;
    return da - db;
  });

  // Tách upcoming vs past — flat, không group theo tuần
  const now = new Date();
  const upcomingSessions = [];
  const pastSessions     = [];
  sessionsAll.forEach(s => {
    const isPast = s.status === 'cancelled' || s.status === 'done' ||
                   (s.date && new Date(s.date) < now);
    if (isPast) pastSessions.push(s);
    else upcomingSessions.push(s);
  });

  // Map sessionId → trạng thái user
  const userSessionState = {};
  if (userId) {
    sessionsAll.forEach(s => {
      const en = (s.enrollments || []).find(e => e.idUser && e.idUser.toString() === userId);
      userSessionState[s._id.toString()] = en
        ? {
            enrolled: true,
            paymentStatus: en.paymentStatus,
            type: en.type,
            adminNote: en.adminNote || ''
          }
        : { enrolled: false };
    });
  }

  return res.render('./practice/detail', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    cls,
    upcomingSessions,
    pastSessions,
    userIs2M,
    userIsPracticeStudent,
    userId,
    userSessionState,
    profileComplete,
    isFollowing,
    followerCount,
    rankLevels: RANK_LEVELS,
    getRankLabel
  });
});

// ── Toggle follow lớp ──
Router.post('/:id/follow', ensureAuthenticated, interactionLimiter, express.json(), async (req, res) => {
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false, msg: 'Không tìm thấy lớp' });

  const userIdStr = req.user._id.toString();
  const idx = (cls.followers || []).findIndex(f => f && f.toString() === userIdStr);
  if (idx === -1) {
    cls.followers.push(req.user._id);
    await cls.save();
    return res.json({ ok: true, following: true, followerCount: cls.followers.length });
  } else {
    cls.followers.splice(idx, 1);
    await cls.save();
    return res.json({ ok: true, following: false, followerCount: cls.followers.length });
  }
});

// ── User đăng ký 1 buổi cụ thể ──
Router.post('/:id/sessions/:sid/register', ensureAuthenticated, enrollmentLimiter, express.json(), async (req, res) => {
  if (!isProfileCompleteForPractice(req.user)) {
    return res.json({ ok: false, msg: 'Vui lòng cập nhật đầy đủ SĐT Zalo, tên trong game và mức rank trước khi đăng ký', code: 'PROFILE_INCOMPLETE' });
  }

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls || cls.status !== 'active') {
    return res.json({ ok: false, msg: 'Lớp thực hành không tồn tại hoặc đã đóng' });
  }

  const s = cls.sessions.id(req.params.sid);
  if (!s) return res.json({ ok: false, msg: 'Không tìm thấy buổi học' });
  if (s.status === 'cancelled' || s.status === 'done') {
    return res.json({ ok: false, msg: 'Buổi học đã kết thúc hoặc bị hủy' });
  }
  if (s.date && new Date(s.date) < new Date()) {
    return res.json({ ok: false, msg: 'Buổi học đã qua' });
  }

  const userIs2M = await is2MStudent(req.user);
  const userIsStudent = await isPracticeStudent(req.user);
  const userId = req.user._id;
  const userIdStr = userId.toString();

  const existing = s.enrollments.find(e => e.idUser && e.idUser.toString() === userIdStr);
  if (existing && ['requested', 'approved', 'paid', 'free'].includes(existing.paymentStatus)) {
    return res.json({ ok: false, msg: 'Bạn đã đăng ký buổi này rồi' });
  }

  const enrollment = {
    idUser:        userId,
    type:          userIs2M ? '2M' : (userIsStudent ? 'student' : 'paid'),
    paymentStatus: 'requested',
    orderCode:     null,
    amount:        userIsStudent ? 0 : (cls.pricePerSession || 50000),
    enrolledAt:    new Date(),
    snapshotZaloPhone:  req.user.zaloPhone || '',
    snapshotInGameName: req.user.inGameName || '',
    snapshotRank:       req.user.rank || ''
  };

  if (existing) {
    Object.assign(existing, enrollment);
  } else {
    s.enrollments.push(enrollment);
  }

  // Auto-follow lớp khi đăng ký buổi đầu tiên
  if (!(cls.followers || []).some(f => f && f.toString() === userIdStr)) {
    cls.followers.push(userId);
  }

  await cls.save();
  return res.json({ ok: true, msg: 'Đã gửi yêu cầu, admin sẽ xem xét và phản hồi.' });
});

// ── Backwards-compat: /request vẫn hoạt động (đăng ký nhiều buổi 1 lúc) ──
Router.post('/:id/request', ensureAuthenticated, enrollmentLimiter, express.json(), async (req, res) => {
  const { sessionIds } = req.body;
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return res.json({ ok: false, msg: 'Vui lòng chọn ít nhất 1 buổi' });
  }
  if (!isProfileCompleteForPractice(req.user)) {
    return res.json({ ok: false, msg: 'Vui lòng cập nhật đầy đủ SĐT Zalo, tên trong game và mức rank trước khi đăng ký', code: 'PROFILE_INCOMPLETE' });
  }

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls || cls.status !== 'active') {
    return res.json({ ok: false, msg: 'Lớp thực hành không tồn tại hoặc đã đóng' });
  }

  const userIs2M = await is2MStudent(req.user);
  const userIsStudent = await isPracticeStudent(req.user);
  const userId = req.user._id;
  const userIdStr = userId.toString();
  const created = [];
  const skipped = [];

  for (const sid of sessionIds) {
    const s = cls.sessions.id(sid);
    if (!s) { skipped.push({ sid, reason: 'không tồn tại' }); continue; }
    if (s.status === 'cancelled' || s.status === 'done') { skipped.push({ sid, reason: 'đã kết thúc/hủy' }); continue; }
    if (s.date && new Date(s.date) < new Date()) { skipped.push({ sid, reason: 'đã qua' }); continue; }

    const existing = s.enrollments.find(e => e.idUser && e.idUser.toString() === userIdStr);
    if (existing && ['requested', 'approved', 'paid', 'free'].includes(existing.paymentStatus)) {
      skipped.push({ sid, reason: 'đã đăng ký' }); continue;
    }

    const enrollment = {
      idUser: userId,
      type: userIs2M ? '2M' : (userIsStudent ? 'student' : 'paid'),
      paymentStatus: 'requested',
      orderCode: null,
      amount: userIsStudent ? 0 : (cls.pricePerSession || 50000),
      enrolledAt: new Date(),
      snapshotZaloPhone: req.user.zaloPhone || '',
      snapshotInGameName: req.user.inGameName || '',
      snapshotRank: req.user.rank || ''
    };
    if (existing) Object.assign(existing, enrollment);
    else s.enrollments.push(enrollment);
    created.push(sid);
  }

  if (created.length === 0) return res.json({ ok: false, msg: 'Không có buổi nào được đăng ký', skipped });

  if (!(cls.followers || []).some(f => f && f.toString() === userIdStr)) {
    cls.followers.push(userId);
  }

  await cls.save();
  return res.json({ ok: true, created, skipped, msg: `Đã gửi yêu cầu cho ${created.length} buổi.` });
});

// ── User thanh toán cho buổi đã được approved (chỉ paid type) ──
Router.post('/:id/sessions/:sid/pay', ensureAuthenticated, paymentLimiter, async (req, res) => {
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return renderNotFound(res);
  const session = cls.sessions.id(req.params.sid);
  if (!session) return renderNotFound(res);

  const en = findUserEnrollment(session, req.user._id);
  if (!en) {
    req.flash && req.flash('error_msg', 'Bạn chưa đăng ký buổi này');
    return res.redirect('/practice/my');
  }

  const userIsStudent = await isPracticeStudent(req.user);
  if (userIsStudent || en.type !== 'paid' || Number(en.amount) <= 0) {
    en.type = en.type === '2M' ? '2M' : 'student';
    en.paymentStatus = 'free';
    en.amount = 0;
    en.orderCode = null;
    en.reviewedAt = en.reviewedAt || new Date();
    await cls.save();
    req.flash && req.flash('success_msg', 'Bạn là học viên nên buổi này không cần thanh toán');
    return res.redirect('/practice/my');
  }
  if (!['approved', 'pending'].includes(en.paymentStatus)) {
    req.flash && req.flash('error_msg', 'Yêu cầu chưa được admin duyệt');
    return res.redirect('/practice/my');
  }

  const amount = en.amount || cls.pricePerSession || 50000;
  const orderCode = en.paymentStatus === 'pending' && en.orderCode
    ? Number(en.orderCode)
    : Number(String(Date.now()).slice(-8) + String(req.user._id).slice(-4).replace(/[^0-9]/g, '0'));
  const baseUrl = getPublicAppUrl(req);

  en.paymentStatus = 'pending';
  en.orderCode     = orderCode;
  en.amount        = amount;
  await cls.save();

  const paymentData = {
    orderCode,
    amount,
    description: `Buoi thuc hanh`.slice(0, 25),
    items: [{
      name:     (session.title || cls.name).slice(0, 50),
      quantity: 1,
      price:    amount
    }],
    returnUrl: `${baseUrl}/practice/${cls._id}/sessions/${session._id}/success?orderCode=${orderCode}`,
    cancelUrl: `${baseUrl}/practice/${cls._id}/sessions/${session._id}/cancel?orderCode=${orderCode}`
  };

  try {
    const paymentLink = await getPayOS().paymentRequests.create(paymentData);
    req.session.pendingPracticePayment = {
      orderCode,
      classId:   cls._id.toString(),
      sessionId: session._id.toString(),
      amount
    };
    return res.redirect(paymentLink.checkoutUrl);
  } catch (err) {
    console.error('[PracticePayOS create error]', err.message);
    rollbackPendingPracticePayment(en);
    await cls.save();
    req.session.pendingPracticePayment = null;
    req.flash && req.flash('error_msg', 'Không tạo được link thanh toán. Vui lòng thử lại.');
    return res.redirect('/practice/my');
  }
});

// ── Callback PayOS thành công ──
Router.get('/:id/sessions/:sid/success', ensureAuthenticated, async (req, res) => {
  const { orderCode } = req.query;

  let paymentInfo;
  try {
    paymentInfo = await getPayOS().paymentRequests.get(Number(orderCode));
  } catch (err) {
    console.error('[PracticePayOS verify error]', err.message);
    req.flash && req.flash('error_msg', 'Không thể xác minh thanh toán');
    return res.redirect('/practice/' + req.params.id);
  }

  if (!paymentInfo || paymentInfo.status !== 'PAID') {
    req.flash && req.flash('error_msg', 'Giao dịch chưa được xác nhận');
    return res.redirect('/practice/' + req.params.id);
  }

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return renderNotFound(res);

  const session = cls.sessions.id(req.params.sid);
  if (!session) return renderNotFound(res);

  const userIdStr = req.user._id.toString();
  const en = session.enrollments.find(e =>
    e.idUser && e.idUser.toString() === userIdStr &&
    Number(e.orderCode) === Number(orderCode)
  );
  if (en) {
    en.paymentStatus = 'paid';
    await cls.save();
  }

  req.session.pendingPracticePayment = null;

  return res.render('./practice/success', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    cls,
    session,
    amount: paymentInfo.amount || cls.pricePerSession
  });
});

// ── Hủy thanh toán: chuyển lại trạng thái 'approved' ──
Router.get('/:id/sessions/:sid/cancel', ensureAuthenticated, async (req, res) => {
  const { orderCode } = req.query;
  const cls = await PracticeClass.findById(req.params.id);
  if (cls) {
    const session = cls.sessions.id(req.params.sid);
    if (session) {
      const en = findUserEnrollment(session, req.user._id);
      if (en && Number(en.orderCode) === Number(orderCode) && rollbackPendingPracticePayment(en)) {
        await cls.save();
      }
    }
  }

  req.session.pendingPracticePayment = null;
  req.flash && req.flash('error_msg', 'Bạn đã hủy thanh toán');
  return res.redirect('/practice/my');
});

Router.post('/:id/sessions/:sid/payment-cancel', ensureAuthenticated, interactionLimiter, express.json(), async (req, res) => {
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false, msg: 'Không tìm thấy lớp' });
  const session = cls.sessions.id(req.params.sid);
  if (!session) return res.json({ ok: false, msg: 'Không tìm thấy buổi học' });

  const en = findUserEnrollment(session, req.user._id);
  if (!en) return res.json({ ok: false, msg: 'Bạn chưa đăng ký buổi này' });
  if (!rollbackPendingPracticePayment(en)) {
    return res.json({ ok: false, msg: 'Buổi này không ở trạng thái chờ thanh toán' });
  }

  await cls.save();
  req.session.pendingPracticePayment = null;
  return res.json({ ok: true });
});

// ── User hủy yêu cầu đang ở trạng thái requested/approved ──
Router.post('/:id/sessions/:sid/withdraw', ensureAuthenticated, enrollmentLimiter, express.json(), async (req, res) => {
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return res.json({ ok: false });
  const session = cls.sessions.id(req.params.sid);
  if (!session) return res.json({ ok: false });

  const userIdStr = req.user._id.toString();
  const en = session.enrollments.find(e => e.idUser && e.idUser.toString() === userIdStr);
  if (!en) return res.json({ ok: false, msg: 'Bạn chưa đăng ký' });

  if (!['requested', 'approved', 'rejected'].includes(en.paymentStatus)) {
    return res.json({ ok: false, msg: 'Không thể hủy yêu cầu đã thanh toán hoặc đang xử lý' });
  }

  session.enrollments = session.enrollments.filter(e => !(e.idUser && e.idUser.toString() === userIdStr));
  await cls.save();
  return res.json({ ok: true });
});

module.exports = Router;
