const express = require('express');
const { PayOS } = require('@payos/node');

const Router = express.Router();

const Course = require('../models/Course.model');
const CourseCategory = require('../models/CourseCategory.model');
const CourseTopic = require('../models/CourseTopic.model');
const LocalUser = require('../models/LocalUser.model');
const PaymentOrder = require('../models/PaymentOrder.model');
const CourseClass = require('../models/CourseClass.model');
const { ensureAuthenticated } = require('../config/auth.config');
const { getPublicAppUrl } = require('../utils/publicAppUrl');

const safeArray = (value) => Array.isArray(value) ? value : [];
const renderNotFound = (res) => res.status(404).render('./error/404', { layout: false });
const renderServerError = (res) => res.status(500).render('./error/500', { layout: false });

function isDiscountExpired(expiresAt) {
  if (!expiresAt) return false;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return true;

  const endOfDayVietnam = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    16, 59, 59, 999
  ));
  return new Date() > endOfDayVietnam;
}

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

function normalizeOrderCode(value) {
  const orderCode = Number(value);
  return Number.isSafeInteger(orderCode) && orderCode > 0 ? orderCode : null;
}

async function generateOrderCode() {
  for (let i = 0; i < 5; i++) {
    const suffix = Math.floor(100 + Math.random() * 900);
    const orderCode = Number(`${Date.now()}${suffix}`);
    const exists = await PaymentOrder.exists({ orderCode });
    if (!exists) return orderCode;
  }

  throw new Error('Cannot generate unique payment order code');
}

function getValidDiscount(course, discountCode) {
  const code = (discountCode || '').trim().toUpperCase();
  if (!code) return null;

  return safeArray(course.discountCodes).find((discount) => {
    return discount.active
      && discount.code === code
      && !isDiscountExpired(discount.expiresAt)
      && ((Number(discount.maxUses) || 0) === 0 || (Number(discount.usedCount) || 0) < Number(discount.maxUses));
  }) || null;
}

function buildPaymentAmount(course, discountCode) {
  const originalAmount = Math.max(0, Number(course.tuition) || 0);
  const discount = getValidDiscount(course, discountCode);
  const discountPercent = discount ? Math.max(0, Math.min(100, Number(discount.percent) || 0)) : 0;
  const discountedAmount = Math.round(originalAmount * (1 - discountPercent / 100));

  return {
    originalAmount,
    amount: Math.max(0, discountedAmount),
    discountCode: discount ? discount.code : '',
    discountPercent
  };
}

function getPaymentDescription(course) {
  return `Khoa hoc ${course.name}`.replace(/\s+/g, ' ').slice(0, 25);
}

async function canPurchaseCourse(user, course) {
  if (!user || !course) {
    return false;
  }

  if (course.courseType === 'hour') {
    return true;
  }

  const courseId = course._id.toString();
  const purchaseCount = safeArray(user.purchasedCourses)
    .filter((item) => item.idCourse && item.idCourse.toString() === courseId)
    .length;

  if (purchaseCount === 0) {
    return true;
  }

  const classes = await CourseClass.find({
    idCourse: course._id,
    'students.idUser': user._id
  }).select('status');

  const activeClass = classes.some((cls) => !['completed', 'cancelled'].includes(cls.status));
  if (activeClass) {
    return false;
  }

  const completedCount = classes.filter((cls) => cls.status === 'completed').length;
  return completedCount >= purchaseCount;
}

async function refreshLoggedInUser(req, userId) {
  const updated = await LocalUser.findById(userId);
  if (!updated) return null;

  await new Promise((resolve, reject) => {
    req.logIn(updated, (error) => error ? reject(error) : resolve());
  });

  return updated;
}

async function enrollCoursePurchase(order) {
  const course = await Course.findById(order.idCourse).populate('idCourseTopic');
  if (!course) {
    throw new Error('Course not found for paid order');
  }

  const updateResult = await LocalUser.updateOne(
    { _id: order.idUser },
    {
      $push: {
        purchasedCourses: {
          idCourse: course._id,
          courseType: course.courseType === 'hour' ? 'hour' : 'session',
          hoursPurchased: course.courseType === 'hour' ? (Number(course.totalHours) || 0) : 0,
          learnedVideos: [],
          enrolledAt: new Date(),
          lastLearnedAt: null
        }
      },
      $addToSet: {
        idCourses: course._id
      }
    }
  );

  const didEnroll = Boolean(updateResult.modifiedCount || updateResult.nModified);
  if (!didEnroll) {
    return course;
  }

  await Course.updateOne({ _id: course._id }, { $inc: { numberOfStudent: 1 } });

  const courseTopicId = course.idCourseTopic && course.idCourseTopic._id;
  const courseCategoryId = course.idCourseTopic && course.idCourseTopic.idCourseCategory;
  await Promise.all([
    courseTopicId ? CourseTopic.updateOne({ _id: courseTopicId }, { $inc: { numberOfSignUp: 1 } }) : null,
    courseCategoryId ? CourseCategory.updateOne({ _id: courseCategoryId }, { $inc: { numberOfSignUp: 1 } }) : null
  ].filter(Boolean));

  if (order.discountCode) {
    await Course.updateOne(
      { _id: course._id, 'discountCodes.code': order.discountCode },
      { $inc: { 'discountCodes.$.usedCount': 1 } }
    );
  }

  return course;
}

async function completePaidOrder(orderCode, providerData = null) {
  const order = await PaymentOrder.findOne({ orderCode });
  if (!order) {
    return { order: null, course: null, completed: false };
  }

  if (order.status === 'paid') {
    const course = await Course.findById(order.idCourse).populate('idCourseTopic');
    return { order, course, completed: false };
  }

  const course = await enrollCoursePurchase(order);

  order.status = 'paid';
  order.paidAt = order.paidAt || new Date();
  order.rawProviderData = providerData || order.rawProviderData;
  await order.save();

  return { order, course, completed: true };
}

async function markOrderCancelled(orderCode, userId) {
  if (!orderCode) return null;

  const order = await PaymentOrder.findOne({
    orderCode,
    idUser: userId,
    status: 'pending'
  });

  if (!order) return null;

  try {
    await getPayOS().paymentRequests.cancel(orderCode, 'User cancelled payment');
  } catch (error) {
    console.warn('[PayOS cancel warning]', error.message);
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date();
  await order.save();

  return order;
}

Router.get('/history', ensureAuthenticated, async (req, res) => {
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

Router.post('/:nameCourse/checkout', ensureAuthenticated, async (req, res) => {
  const course = await Course.findOne({ name: req.params.nameCourse });
  if (!course) return renderNotFound(res);

  if (!(await canPurchaseCourse(req.user, course))) {
    return res.redirect('/my-courses');
  }

  if (course.priceType === 'contact') {
    return res.redirect(`/payment/${encodeURIComponent(course.name)}/checkout`);
  }

  const pricing = buildPaymentAmount(course, req.body.discountCode);
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
  await markOrderCancelled(orderCode, req.user._id);

  req.flash && req.flash('error_msg', 'Bạn đã hủy thanh toán');
  return res.redirect('/course/' + encodeURIComponent(req.params.nameCourse));
});

Router.get('/:nameCourse/fail', ensureAuthenticated, (req, res) => {
  return res.redirect('/my-courses');
});

module.exports = Router;
