const express = require('express');
const Router  = express.Router();
const { PayOS } = require('@payos/node');
const PracticeClass = require('../models/PracticeClass.model');
const LocalUser     = require('../models/LocalUser.model');
const { ensureAuthenticated } = require('../config/auth.config');
const {
  is2MStudent,
  getUser2MCourses,
  isProfileCompleteForPractice,
  getRankLabel,
  RANK_LEVELS
} = require('../config/practice.config');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';

let _payos = null;
function getPayOS() {
  if (!_payos) {
    if (!process.env.PAYOS_CLIENT_ID || !process.env.PAYOS_API_KEY || !process.env.PAYOS_CHECKSUM_KEY) {
      throw new Error('PayOS credentials chưa được cấu hình trong .env');
    }
    _payos = new PayOS(
      process.env.PAYOS_CLIENT_ID,
      process.env.PAYOS_API_KEY,
      process.env.PAYOS_CHECKSUM_KEY
    );
  }
  return _payos;
}

const renderNotFound    = (res) => res.status(404).render('./error/404', { layout: false });
const renderServerError = (res) => res.status(500).render('./error/500', { layout: false });

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
  if (req.isAuthenticated() && req.user) {
    userIs2M = await is2MStudent(req.user);
  }

  return res.render('./practice/list', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    classes,
    userIs2M
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

  return res.render('./practice/my-practice', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    items,
    userIs2M,
    getRankLabel
  });
});

// ── Chi tiết 1 lớp thực hành — nhóm sessions theo tuần ──
Router.get('/:id', async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return renderNotFound(res);
  }

  const cls = await PracticeClass.findById(req.params.id)
    .populate('idLecturer', 'name avatar email');
  if (!cls) return renderNotFound(res);

  let userIs2M = false;
  let userId = null;
  let profileComplete = false;
  if (req.isAuthenticated() && req.user) {
    userIs2M = await is2MStudent(req.user);
    userId = req.user._id.toString();
    profileComplete = isProfileCompleteForPractice(req.user);
  }

  // Sort sessions theo ngày
  const sessions = cls.sessions.slice().sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : Infinity;
    const db = b.date ? new Date(b.date).getTime() : Infinity;
    return da - db;
  });

  // Nhóm theo tuần (Mon-Sun)
  const weekMap = {};
  sessions.forEach(s => {
    if (!s.date) return;
    const key = weekKeyOf(s.date);
    if (!weekMap[key]) weekMap[key] = { weekKey: key, weekStart: parseWeekKey(key), sessions: [] };
    weekMap[key].sessions.push(s);
  });

  const weeks = Object.keys(weekMap).sort().map(k => weekMap[k]);

  // Lọc tuần hiện tại + tương lai (so sánh key string trực tiếp)
  const todayKey = weekKeyOf(new Date());
  const upcomingWeeks = weeks.filter(w => w.weekKey >= todayKey);
  const pastWeeks     = weeks.filter(w => w.weekKey <  todayKey);

  // Map sessionId → trạng thái user
  const userSessionState = {};
  if (userId) {
    sessions.forEach(s => {
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
    upcomingWeeks,
    pastWeeks,
    userIs2M,
    userId,
    userSessionState,
    profileComplete,
    rankLevels: RANK_LEVELS,
    getRankLabel
  });
});

// ── User gửi yêu cầu đăng ký nhiều buổi (1 hoặc cả 2 ngày) ──
Router.post('/:id/request', ensureAuthenticated, express.json(), async (req, res) => {
  const { sessionIds } = req.body;
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return res.json({ ok: false, msg: 'Vui lòng chọn ít nhất 1 buổi' });
  }

  // Validate profile
  if (!isProfileCompleteForPractice(req.user)) {
    return res.json({ ok: false, msg: 'Vui lòng cập nhật đầy đủ SĐT Zalo, tên trong game và mức rank trước khi đăng ký', code: 'PROFILE_INCOMPLETE' });
  }

  const cls = await PracticeClass.findById(req.params.id);
  if (!cls || cls.status !== 'active') {
    return res.json({ ok: false, msg: 'Lớp thực hành không tồn tại hoặc đã đóng' });
  }

  const userIs2M = await is2MStudent(req.user);
  const userId = req.user._id;
  const userIdStr = userId.toString();

  const created = [];
  const skipped = [];

  for (const sid of sessionIds) {
    const s = cls.sessions.id(sid);
    if (!s) { skipped.push({ sid, reason: 'không tồn tại' }); continue; }
    if (s.status === 'cancelled' || s.status === 'done') {
      skipped.push({ sid, reason: 'đã kết thúc/hủy' }); continue;
    }
    if (s.date && new Date(s.date) < new Date()) {
      skipped.push({ sid, reason: 'đã qua' }); continue;
    }

    const existing = s.enrollments.find(e => e.idUser && e.idUser.toString() === userIdStr);
    if (existing && ['requested', 'approved', 'paid', 'free'].includes(existing.paymentStatus)) {
      skipped.push({ sid, reason: 'đã đăng ký' }); continue;
    }

    const enrollment = {
      idUser:        userId,
      type:          userIs2M ? '2M' : 'paid',
      paymentStatus: 'requested',
      orderCode:     null,
      amount:        userIs2M ? 0 : (cls.pricePerSession || 50000),
      enrolledAt:    new Date(),
      snapshotZaloPhone:  req.user.zaloPhone || '',
      snapshotInGameName: req.user.inGameName || '',
      snapshotRank:       req.user.rank || ''
    };

    if (existing) {
      // Reset từ rejected/cancelled → requested mới
      Object.assign(existing, enrollment);
    } else {
      s.enrollments.push(enrollment);
    }
    created.push(sid);
  }

  if (created.length === 0) {
    return res.json({ ok: false, msg: 'Không có buổi nào được đăng ký', skipped });
  }

  await cls.save();
  return res.json({ ok: true, created, skipped, msg: `Đã gửi yêu cầu cho ${created.length} buổi. Admin sẽ xem xét và phản hồi.` });
});

// ── User thanh toán cho buổi đã được approved (chỉ paid type) ──
Router.post('/:id/sessions/:sid/pay', ensureAuthenticated, async (req, res) => {
  const cls = await PracticeClass.findById(req.params.id);
  if (!cls) return renderNotFound(res);
  const session = cls.sessions.id(req.params.sid);
  if (!session) return renderNotFound(res);

  const userIdStr = req.user._id.toString();
  const en = session.enrollments.find(e => e.idUser && e.idUser.toString() === userIdStr);
  if (!en) {
    req.flash && req.flash('error_msg', 'Bạn chưa đăng ký buổi này');
    return res.redirect('/practice/my');
  }
  if (en.type !== 'paid') {
    req.flash && req.flash('error_msg', 'Buổi này không cần thanh toán');
    return res.redirect('/practice/my');
  }
  if (en.paymentStatus !== 'approved') {
    req.flash && req.flash('error_msg', 'Yêu cầu chưa được admin duyệt');
    return res.redirect('/practice/my');
  }

  const amount = en.amount || cls.pricePerSession || 50000;
  const orderCode = Number(String(Date.now()).slice(-8) + String(req.user._id).slice(-4).replace(/[^0-9]/g, '0'));

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
    returnUrl: `${APP_URL}/practice/${cls._id}/sessions/${session._id}/success?orderCode=${orderCode}`,
    cancelUrl: `${APP_URL}/practice/${cls._id}/sessions/${session._id}/cancel?orderCode=${orderCode}`
  };

  try {
    const paymentLink = await getPayOS().createPaymentLink(paymentData);
    req.session.pendingPracticePayment = {
      orderCode,
      classId:   cls._id.toString(),
      sessionId: session._id.toString(),
      amount
    };
    return res.redirect(paymentLink.checkoutUrl);
  } catch (err) {
    console.error('[PracticePayOS create error]', err.message);
    return renderServerError(res);
  }
});

// ── Callback PayOS thành công ──
Router.get('/:id/sessions/:sid/success', ensureAuthenticated, async (req, res) => {
  const { orderCode, status } = req.query;

  if (status !== 'PAID') {
    req.flash && req.flash('error_msg', 'Thanh toán chưa hoàn tất');
    return res.redirect('/practice/' + req.params.id);
  }

  let paymentInfo;
  try {
    paymentInfo = await getPayOS().getPaymentLinkInformation(orderCode);
  } catch (err) {
    console.error('[PracticePayOS verify error]', err.message);
    req.flash && req.flash('error_msg', 'Không thể xác minh thanh toán');
    return res.redirect('/practice/' + req.params.id);
  }

  if (paymentInfo.status !== 'PAID') {
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
      const userIdStr = req.user._id.toString();
      const en = session.enrollments.find(e =>
        e.idUser && e.idUser.toString() === userIdStr &&
        Number(e.orderCode) === Number(orderCode) &&
        e.paymentStatus === 'pending'
      );
      if (en) {
        en.paymentStatus = 'approved';
        en.orderCode = null;
        await cls.save();
      }
    }
  }

  req.session.pendingPracticePayment = null;
  req.flash && req.flash('error_msg', 'Bạn đã hủy thanh toán');
  return res.redirect('/practice/my');
});

// ── User hủy yêu cầu đang ở trạng thái requested/approved ──
Router.post('/:id/sessions/:sid/withdraw', ensureAuthenticated, express.json(), async (req, res) => {
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
