const request = require('supertest');
const SupportTicket = require('../../models/SupportTicket.model');
const supportRouter = require('../../routers/support.route');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('../setup/testDb');
const { createRouterApp } = require('../helpers/routerApp');

describe('support.route', () => {
  let app;

  beforeAll(async () => {
    await connectTestDb();
    app = createRouterApp(supportRouter, { basePath: '/support' });
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('POST /support returns 400 when pageUrl is missing', async () => {
    const response = await request(app)
      .post('/support')
      .send({ message: 'Need help' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ ok: false, msg: 'Missing pageUrl' });
  });

  test('POST /support creates ticket and returns ok', async () => {
    const response = await request(app)
      .post('/support')
      .set('User-Agent', 'jest-test')
      .send({
        pageUrl: 'https://example.test/payment',
        errorType: 'payment',
        message: 'Something broke',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const ticket = await SupportTicket.findOne({ pageUrl: 'https://example.test/payment' }).lean();
    expect(ticket).toBeTruthy();
    expect(ticket.errorType).toBe('payment');
    expect(ticket.message).toBe('Something broke');
  });
});
