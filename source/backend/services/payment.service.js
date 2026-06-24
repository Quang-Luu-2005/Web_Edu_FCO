const Course = require('../models/Course.model');
const CourseCategory = require('../models/CourseCategory.model');
const CourseTopic = require('../models/CourseTopic.model');
const LocalUser = require('../models/LocalUser.model');
const PaymentOrder = require('../models/PaymentOrder.model');
const CourseClass = require('../models/CourseClass.model');

const safeArray = (value) => Array.isArray(value) ? value : [];

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

async function markOrderCancelled({ orderCode, userId, cancelPayment }) {
  if (!orderCode) return null;

  const order = await PaymentOrder.findOne({
    orderCode,
    idUser: userId,
    status: 'pending'
  });

  if (!order) return null;

  if (typeof cancelPayment === 'function') {
    try {
      await cancelPayment(orderCode);
    } catch (error) {
      console.warn('[Payment cancel warning]', error.message);
    }
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date();
  await order.save();

  return order;
}

module.exports = {
  buildPaymentAmount,
  canPurchaseCourse,
  completePaidOrder,
  enrollCoursePurchase,
  generateOrderCode,
  getPaymentDescription,
  getValidDiscount,
  isDiscountExpired,
  markOrderCancelled,
  normalizeOrderCode,
  refreshLoggedInUser,
};
