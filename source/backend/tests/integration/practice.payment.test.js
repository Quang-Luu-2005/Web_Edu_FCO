const mockCreatePayment = jest.fn();
const mockGetPayment = jest.fn();

jest.mock('@payos/node', () => ({
  PayOS: jest.fn().mockImplementation(() => ({
    paymentRequests: {
      create: mockCreatePayment,
      get: mockGetPayment,
    },
  })),
}));

const request = require('supertest');
const LocalUser = require('../../models/LocalUser.model');
const PracticeClass = require('../../models/PracticeClass.model');
const practiceRouter = require('../../routers/practice.route');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('../setup/testDb');
const { createRouterApp, resetAllRateLimits } = require('../helpers/routerApp');

describe('practice payment recovery', () => {
  let currentUserId;
  let app;

  beforeAll(async () => {
    await connectTestDb();
    app = createRouterApp(practiceRouter, {
      basePath: '/practice',
      resolveUser: () => currentUserId ? LocalUser.findById(currentUserId) : null,
    });
  });

  beforeEach(async () => {
    mockCreatePayment.mockReset();
    mockGetPayment.mockReset();

    const user = await LocalUser.create({
      username: 'practicepayer',
      email: 'practicepayer@example.com',
      password: 'hashed',
      name: 'Practice Payer',
      role: 'guest',
      isAuth: true,
      zaloPhone: '0901234567',
      inGameName: 'player-one',
      rank: 'ban-chuyen',
    });
    currentUserId = user._id;
  });

  afterEach(async () => {
    currentUserId = null;
    await resetAllRateLimits();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  async function createApprovedPracticeClass() {
    return PracticeClass.create({
      name: 'Practice Weekly',
      pricePerSession: 50000,
      sessions: [{
        _id: '686000000000000000000001',
        title: 'Session 1',
        status: 'scheduled',
        enrollments: [{
          idUser: currentUserId,
          type: 'paid',
          paymentStatus: 'approved',
          amount: 50000,
          reviewedAt: new Date(),
        }]
      }]
    });
  }

  test('practice pay rolls back pending to approved when PayOS link creation fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const cls = await createApprovedPracticeClass();
    const sid = cls.sessions[0]._id.toString();
    mockCreatePayment.mockRejectedValue(new Error('PayOS unavailable'));

    const response = await request(app)
      .post(`/practice/${cls._id}/sessions/${sid}/pay`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/practice/my');
    expect(errorSpy).toHaveBeenCalledWith('[PracticePayOS create error]', 'PayOS unavailable');

    const updated = await PracticeClass.findById(cls._id).lean();
    expect(updated.sessions[0].enrollments[0].paymentStatus).toBe('approved');
    expect(updated.sessions[0].enrollments[0].orderCode).toBeNull();
  });

  test('practice pay allows retry from pending state', async () => {
    const cls = await createApprovedPracticeClass();
    const sid = cls.sessions[0]._id.toString();
    await PracticeClass.updateOne(
      { _id: cls._id, 'sessions._id': cls.sessions[0]._id },
      {
        $set: {
          'sessions.$.enrollments.0.paymentStatus': 'pending',
          'sessions.$.enrollments.0.orderCode': 12345678,
        }
      }
    );
    mockCreatePayment.mockResolvedValue({ checkoutUrl: 'https://payos.test/retry' });

    const response = await request(app)
      .post(`/practice/${cls._id}/sessions/${sid}/pay`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://payos.test/retry');
  });

  test('practice payment-cancel returns pending to approved', async () => {
    const cls = await createApprovedPracticeClass();
    const sid = cls.sessions[0]._id.toString();
    await PracticeClass.updateOne(
      { _id: cls._id, 'sessions._id': cls.sessions[0]._id },
      {
        $set: {
          'sessions.$.enrollments.0.paymentStatus': 'pending',
          'sessions.$.enrollments.0.orderCode': 98765432,
        }
      }
    );

    const response = await request(app)
      .post(`/practice/${cls._id}/sessions/${sid}/payment-cancel`)
      .send({});

    expect(response.body).toEqual({ ok: true });
    const updated = await PracticeClass.findById(cls._id).lean();
    expect(updated.sessions[0].enrollments[0].paymentStatus).toBe('approved');
    expect(updated.sessions[0].enrollments[0].orderCode).toBeNull();
  });
});
