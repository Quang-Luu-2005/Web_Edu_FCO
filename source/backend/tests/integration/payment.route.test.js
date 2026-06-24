const mockCreatePayment = jest.fn();
const mockGetPayment = jest.fn();
const mockCancelPayment = jest.fn();
const mockVerifyWebhook = jest.fn();

jest.mock('@payos/node', () => ({
  PayOS: jest.fn().mockImplementation(() => ({
    paymentRequests: {
      create: mockCreatePayment,
      get: mockGetPayment,
      cancel: mockCancelPayment,
    },
    webhooks: {
      verify: mockVerifyWebhook,
    },
  })),
}));

const request = require('supertest');
const LocalUser = require('../../models/LocalUser.model');
const Course = require('../../models/Course.model');
const PaymentOrder = require('../../models/PaymentOrder.model');
const paymentRouter = require('../../routers/payment.route');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('../setup/testDb');
const { createRouterApp } = require('../helpers/routerApp');

describe('payment.route', () => {
  let currentUserId;
  let app;

  beforeAll(async () => {
    await connectTestDb();
    app = createRouterApp(paymentRouter, {
      basePath: '/payment',
      resolveUser: () => currentUserId ? LocalUser.findById(currentUserId) : null,
    });
  });

  beforeEach(async () => {
    mockCreatePayment.mockReset();
    mockGetPayment.mockReset();
    mockCancelPayment.mockReset();
    mockVerifyWebhook.mockReset();

    const user = await LocalUser.create({
      username: 'paymentuser',
      email: 'payment@example.com',
      password: 'hashed',
      name: 'Payment User',
      isAuth: true,
    });
    currentUserId = user._id;
  });

  afterEach(async () => {
    currentUserId = null;
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('POST /payment/:nameCourse/checkout completes free checkout and enrolls user', async () => {
    const course = await Course.create({
      name: 'Free Course',
      tuition: 300000,
      courseType: 'hour',
      totalHours: 8,
      discountCodes: [{
        code: 'FREE100',
        percent: 100,
        maxUses: 0,
        usedCount: 0,
        active: true,
      }],
    });

    const response = await request(app)
      .post(`/payment/${encodeURIComponent(course.name)}/checkout`)
      .send({ discountCode: 'FREE100' });

    expect(response.status).toBe(200);
    expect(response.body.view).toBe('./payment/success');
    expect(response.body.locals.isFree).toBe(true);

    const order = await PaymentOrder.findOne({ courseName: course.name }).lean();
    const user = await LocalUser.findById(currentUserId).lean();

    expect(order).toBeTruthy();
    expect(order.provider).toBe('free');
    expect(order.status).toBe('paid');
    expect(order.amount).toBe(0);
    expect(user.purchasedCourses).toHaveLength(1);
    expect(user.idCourses).toHaveLength(1);
  });

  test('POST /payment/:nameCourse/checkout marks order failed when PayOS create fails', async () => {
    const course = await Course.create({
      name: 'Paid Course',
      tuition: 500000,
      courseType: 'session',
      priceType: 'fixed',
    });
    mockCreatePayment.mockRejectedValue(new Error('PayOS unavailable'));

    const response = await request(app)
      .post(`/payment/${encodeURIComponent(course.name)}/checkout`)
      .send({});

    expect(response.status).toBe(500);
    expect(response.body.view).toBe('./error/500');

    const order = await PaymentOrder.findOne({ courseName: course.name }).lean();
    expect(order).toBeTruthy();
    expect(order.provider).toBe('payos');
    expect(order.status).toBe('failed');
    expect(order.rawProviderData).toEqual({ message: 'PayOS unavailable' });
  });

  test('POST /payment/webhook completes pending paid order', async () => {
    const course = await Course.create({
      name: 'Webhook Course',
      tuition: 450000,
      courseType: 'hour',
      totalHours: 10,
    });
    await PaymentOrder.create({
      orderCode: 9001,
      provider: 'payos',
      status: 'pending',
      idUser: currentUserId,
      idCourse: course._id,
      courseName: course.name,
      courseType: 'hour',
      hoursPurchased: 10,
      originalAmount: 450000,
      amount: 450000,
    });
    mockVerifyWebhook.mockResolvedValue({ code: '00', orderCode: 9001, amount: 450000 });

    const response = await request(app)
      .post('/payment/webhook')
      .send({ data: 'payload' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const order = await PaymentOrder.findOne({ orderCode: 9001 }).lean();
    const user = await LocalUser.findById(currentUserId).lean();
    expect(order.status).toBe('paid');
    expect(user.purchasedCourses).toHaveLength(1);
  });
});
