const express = require('express');
const { PayOS } = require('@payos/node');

const Router = express.Router();

const Course = require('../models/Course.model');
const {
  buildPaymentAmount,
  canPurchaseCourse,
  cancelPendingOrders,
  completePaidOrder,
  findLatestPendingOrder,
  generateOrderCode,
  getPaymentDescription,
  markOrderCancelled,
  normalizeOrderCode,
  refreshLoggedInUser,
} = require('../services/payment.service');
const { ensureAuthenticated } = require('../config/auth.config');
const { getPublicAppUrl } = require('../utils/publicAppUrl');
const { paymentLimiter } = require('../middlewares/rateLimit.mdw');

const renderNotFound = (res) => res.status(404).render('./error/404', { layout: false });
const renderServerError = (res) => res.status(500).render('./error/500', { layout: false });

let payosClient = null;
function getPayOS() {
  if (!payosClient) {
    if (!process.env.PAYOS_CLIENT_ID || !process.env.PAYOS_API_KEY || !process.env.PAYOS_CHECKSUM_KEY) {
      throw new Error('PayOS credentials chưa được cấu hình trong .env');
    }

    payosClient = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID,
      apiKey: process.env.PAYOS_API_KEY,
      checksumKey: process.env.PAYOS_CHECKSUM_KEY,
      partnerCode: process.env.PAYOS_PARTNER_CODE || undefined
    });
  }

  return payosClient;
}

Router.get('/history', ensureAuthenticated, async (req, res) => {
  const PaymentOrder = require('../models/PaymentOrder.model');
  const orders = await PaymentOrder.find({ idUser: req.user._id })
    .populate('idCourse', 'name poster courseType totalHours')
    .sort({ createdAt: -1 })
    .lean();

  return res.render('./payment/history', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    orders
  });
});

Router.get('/:nameCourse/checkout', ensureAuthenticated, async (req, res) => {
  const course = await Course.findOne({ name: req.params.nameCourse });
  if (!course) return renderNotFound(res);

  if (!(await canPurchaseCourse(req.user, course))) {
    return res.redirect('/my-courses');
  }

  if (course.priceType === 'contact') {
    return res.render('./payment/contact', {
      isAuthenticated: req.isAuthenticated(),
      course,
      user: req.user
    });
  }

  return res.render('./payment/checkout', {
    isAuthenticated: req.isAuthenticated(),
    course,
    user: req.user
  });
});

Router.post('/:nameCourse/checkout', ensureAuthenticated, paymentLimiter, async (req, res) => {
  const PaymentOrder = require('../models/PaymentOrder.model');
  const course = await Course.findOne({ name: req.params.nameCourse });
  if (!course) return renderNotFound(res);

  if (!(await canPurchaseCourse(req.user, course))) {
    return res.redirect('/my-courses');
  }

  if (course.priceType === 'contact') {
    return res.redirect(`/payment/${encodeURIComponent(course.name)}/checkout`);
  }

  const pricing = buildPaymentAmount(course, req.body.discountCode);

  if (pricing.amount > 0) {
    const pendingOrder = await findLatestPendingOrder({ userId: req.user._id, courseId: course._id });
    if (pendingOrder && pendingOrder.checkoutUrl) {
      return res.redirect(pendingOrder.checkoutUrl);
    }
    if (pendingOrder) {
      await cancelPendingOrders({
        userId: req.user._id,
        courseId: course._id,
        reason: 'Pending order expired before restarting checkout'
      });
    }
  }

  const orderCode = await generateOrderCode();

  const order = await PaymentOrder.create({
    orderCode,
    provider: pricing.amount === 0 ? 'free' : 'payos',
    idUser: req.user._id,
    idCourse: course._id,
    courseName: course.name,
    courseType: course.courseType === 'hour' ? 'hour' : 'session',
    hoursPurchased: course.courseType === 'hour' ? (Number(course.totalHours) || 0) : 0,
    originalAmount: pricing.originalAmount,
    amount: pricing.amount,
    discountCode: pricing.discountCode,
    discountPercent: pricing.discountPercent
  });

  if (pricing.amount === 0) {
    const result = await completePaidOrder(orderCode, { freeDiscount: true });
    await refreshLoggedInUser(req, req.user._id);
    return res.render('./payment/success', {
      isAuthenticated: req.isAuthenticated(),
      user: req.user,
      course: result.course || course,
      isFree: true,
      amount: 0
    });
  }

  const payosAmount = pricing.amount;

  const baseUrl = getPublicAppUrl(req);
  const encodedName = encodeURIComponent(course.name);
  const paymentData = {
    orderCode,
    amount: payosAmount,
    description: getPaymentDescription(course),
    items: [{
      name: course.name.slice(0, 50),
      quantity: 1,
      price: payosAmount
    }],
    buyerName: req.user.name || req.user.username || undefined,
    buyerEmail: req.user.email || undefined,
    returnUrl: `${baseUrl}/payment/${encodedName}/success?orderCode=${orderCode}`,
    cancelUrl: `${baseUrl}/payment/${encodedName}/cancel?orderCode=${orderCode}`
  };

  try {
    const paymentLink = await getPayOS().paymentRequests.create(paymentData);
    order.paymentLinkId = paymentLink.paymentLinkId || '';
    order.checkoutUrl = paymentLink.checkoutUrl || '';
    order.rawProviderData = paymentLink;
    await order.save();

    return res.redirect(paymentLink.checkoutUrl);
  } catch (error) {
    console.error('[PayOS create error]', error.message);
    order.status = 'failed';
    order.rawProviderData = { message: error.message };
    await order.save();
    return renderServerError(res);
  }
});

Router.get('/:nameCourse/success', ensureAuthenticated, async (req, res) => {
  const orderCode = normalizeOrderCode(req.query.orderCode);
  if (!orderCode) {
    req.flash && req.flash('error_msg', 'Thiếu mã đơn hàng thanh toán');
    return res.redirect('/');
  }

  let paymentInfo;
  try {
    paymentInfo = await getPayOS().paymentRequests.get(orderCode);
  } catch (error) {
    console.error('[PayOS verify error]', error.message);
    req.flash && req.flash('error_msg', 'Không thể xác minh thanh toán');
    return res.redirect('/');
  }

  if (!paymentInfo || paymentInfo.status !== 'PAID') {
    req.flash && req.flash('error_msg', 'Giao dịch chưa được xác nhận');
    return res.redirect(`/payment/${encodeURIComponent(req.params.nameCourse)}/checkout`);
  }

  const result = await completePaidOrder(orderCode, paymentInfo);
  if (!result.order || result.order.idUser.toString() !== req.user._id.toString()) {
    req.flash && req.flash('error_msg', 'Đơn hàng không hợp lệ');
    return res.redirect('/');
  }

  await refreshLoggedInUser(req, req.user._id);

  return res.render('./payment/success', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    course: result.course,
    isFree: result.order.amount === 0,
    amount: paymentInfo.amount || result.order.amount
  });
});

Router.post('/webhook', express.json(), async (req, res) => {
  try {
    const webhookData = await getPayOS().webhooks.verify(req.body);
    console.log('[PayOS webhook]', webhookData);

    if (webhookData && webhookData.code === '00') {
      await completePaidOrder(Number(webhookData.orderCode), webhookData);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[PayOS webhook error]', error.message);
    return res.status(400).json({ success: false });
  }
});

Router.get('/:nameCourse/cancel', ensureAuthenticated, async (req, res) => {
  const orderCode = normalizeOrderCode(req.query.orderCode);
  await markOrderCancelled({
    orderCode,
    userId: req.user._id,
    cancelPayment: async (code) => getPayOS().paymentRequests.cancel(code, 'User cancelled payment')
  });

  req.flash && req.flash('error_msg', 'Bạn đã hủy thanh toán');
  return res.redirect('/course/' + encodeURIComponent(req.params.nameCourse));
});

Router.get('/:nameCourse/fail', ensureAuthenticated, async (req, res) => {
  const course = await Course.findOne({ name: req.params.nameCourse });
  if (course) {
    await cancelPendingOrders({
      userId: req.user._id,
      courseId: course._id,
      reason: 'Checkout failed before completion'
    });
  }

  req.flash && req.flash('error_msg', 'Thanh toán chưa hoàn tất');
  return res.redirect('/my-courses');
});

module.exports = Router;
