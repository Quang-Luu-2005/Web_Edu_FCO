const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

const DEFAULT_MESSAGE = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getWindowMs = (envName, fallback) => parseNumber(process.env[envName], fallback);
const getLimit = (envName, fallback, testFallback = fallback) => {
  return parseNumber(process.env[envName], isTest ? testFallback : fallback);
};

const getIpKey = (req) => {
  const socketAddress = req.socket && req.socket.remoteAddress;
  return (req.ip || socketAddress || 'unknown').toString();
};

const getUserOrIpKey = (req) => {
  if (req.user && req.user._id) {
    return `user:${req.user._id}`;
  }
  return `ip:${getIpKey(req)}`;
};

const shouldReturnJson = (req) => {
  const accept = (req.get('accept') || '').toLowerCase();
  const contentType = (req.get('content-type') || '').toLowerCase();
  return req.xhr || accept.includes('application/json') || contentType.includes('application/json');
};

const buildHandler = (message) => {
  return (req, res, _next, options) => {
    const msg = typeof message === 'function' ? message(req) : (message || DEFAULT_MESSAGE);
    if (shouldReturnJson(req)) {
      return res.status(options.statusCode).json({ ok: false, msg });
    }
    return res.status(options.statusCode).type('text/plain; charset=utf-8').send(msg);
  };
};

const allLimiters = [];

const createLimiter = ({
  envPrefix,
  windowMs,
  limit,
  testLimit = limit,
  message = DEFAULT_MESSAGE,
  keyGenerator,
  skip,
}) => {
  const store = new rateLimit.MemoryStore();
  const limiter = rateLimit({
    windowMs: getWindowMs(`RATE_LIMIT_${envPrefix}_WINDOW_MS`, windowMs),
    limit: getLimit(`RATE_LIMIT_${envPrefix}_MAX`, limit, testLimit),
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    keyGenerator,
    skip,
    handler: buildHandler(message),
    store,
  });

  limiter.resetAll = async () => {
    if (typeof store.resetAll === 'function') {
      await store.resetAll();
    }
  };
  allLimiters.push(limiter);
  return limiter;
};

const resetAllRateLimits = async () => {
  await Promise.all(allLimiters.map((limiter) => limiter.resetAll && limiter.resetAll()));
};

const authLimiter = createLimiter({
  envPrefix: 'AUTH',
  windowMs: 15 * 60 * 1000,
  limit: 5,
  testLimit: 3,
  message: 'Bạn thử đăng nhập hoặc đăng ký quá nhiều lần. Vui lòng thử lại sau ít phút.',
  keyGenerator: (req) => `auth:${getIpKey(req)}`,
});

const otpLimiter = createLimiter({
  envPrefix: 'OTP',
  windowMs: 10 * 60 * 1000,
  limit: 5,
  testLimit: 3,
  message: 'Bạn nhập mã OTP quá nhiều lần. Vui lòng thử lại sau ít phút.',
  keyGenerator: (req) => {
    const sessionEmail = req.session && req.session.currentEmail
      ? String(req.session.currentEmail).trim().toLowerCase()
      : '';
    return sessionEmail ? `otp:${sessionEmail}` : `otp:${getIpKey(req)}`;
  },
});

const supportLimiter = createLimiter({
  envPrefix: 'SUPPORT',
  windowMs: 60 * 60 * 1000,
  limit: 5,
  testLimit: 3,
  message: 'Bạn đã gửi hỗ trợ quá nhiều lần. Vui lòng thử lại sau.',
  keyGenerator: (req) => `support:${getUserOrIpKey(req)}`,
});

const paymentLimiter = createLimiter({
  envPrefix: 'PAYMENT',
  windowMs: 10 * 60 * 1000,
  limit: 5,
  testLimit: 3,
  message: 'Bạn đã thử tạo thanh toán quá nhiều lần. Vui lòng thử lại sau ít phút.',
  keyGenerator: (req) => {
    const resourceId = [req.params.nameCourse, req.params.id, req.params.sid].filter(Boolean).join(':') || 'resource';
    return `payment:${getUserOrIpKey(req)}:${resourceId}`;
  },
});

const userWriteLimiter = createLimiter({
  envPrefix: 'USER_WRITE',
  windowMs: 60 * 60 * 1000,
  limit: 10,
  testLimit: 20,
  message: 'Bạn cập nhật thông tin quá nhiều lần. Vui lòng thử lại sau.',
  keyGenerator: (req) => `user-write:${getUserOrIpKey(req)}`,
});

const reviewLimiter = createLimiter({
  envPrefix: 'REVIEW',
  windowMs: 60 * 60 * 1000,
  limit: 10,
  testLimit: 5,
  message: 'Bạn gửi đánh giá hoặc phản hồi quá nhiều lần. Vui lòng thử lại sau.',
  keyGenerator: (req) => {
    const courseKey = req.params.nameCourse || req.originalUrl || 'course';
    return `review:${getUserOrIpKey(req)}:${courseKey}`;
  },
});

const interactionLimiter = createLimiter({
  envPrefix: 'INTERACTION',
  windowMs: 10 * 60 * 1000,
  limit: 60,
  testLimit: 10,
  message: 'Bạn thao tác quá nhanh. Vui lòng chậm lại một chút.',
  keyGenerator: (req) => `interaction:${getUserOrIpKey(req)}:${(req.route && req.route.path) || req.path || 'route'}`,
});

const enrollmentLimiter = createLimiter({
  envPrefix: 'ENROLLMENT',
  windowMs: 15 * 60 * 1000,
  limit: 10,
  testLimit: 3,
  message: 'Bạn gửi yêu cầu đăng ký quá nhiều lần. Vui lòng thử lại sau.',
  keyGenerator: (req) => {
    const resourceId = [req.params.id, req.params.sid].filter(Boolean).join(':') || 'practice';
    return `enrollment:${getUserOrIpKey(req)}:${resourceId}`;
  },
});

const adminWriteLimiter = createLimiter({
  envPrefix: 'ADMIN_WRITE',
  windowMs: 15 * 60 * 1000,
  limit: 120,
  testLimit: 200,
  message: 'Bạn thao tác quản trị quá nhanh. Vui lòng thử lại sau.',
  keyGenerator: (req) => `admin:${getUserOrIpKey(req)}`,
});

const limitMutatingMethods = (limiter, methods = ['POST', 'PUT', 'PATCH', 'DELETE']) => {
  const allowedMethods = new Set(methods);
  return (req, res, next) => {
    if (!allowedMethods.has(req.method)) {
      return next();
    }
    return limiter(req, res, next);
  };
};

module.exports = {
  authLimiter,
  otpLimiter,
  supportLimiter,
  paymentLimiter,
  userWriteLimiter,
  reviewLimiter,
  interactionLimiter,
  enrollmentLimiter,
  adminWriteLimiter,
  limitMutatingMethods,
  resetAllRateLimits,
};
