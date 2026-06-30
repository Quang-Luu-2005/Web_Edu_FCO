const request = require('supertest');

const originalAdminWriteMax = process.env.RATE_LIMIT_ADMIN_WRITE_MAX;
const originalAdminWriteWindowMs = process.env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS;

async function createAdminLimiterApp() {
  jest.resetModules();
  process.env.RATE_LIMIT_ADMIN_WRITE_MAX = '2';
  process.env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS = '60000';

  const express = require('express');
  const {
    adminWriteLimiter,
    limitMutatingMethods,
    resetAllRateLimits,
  } = require('../../middlewares/rateLimit.mdw');

  const app = express();
  app.use(express.json());
  app.use(limitMutatingMethods(adminWriteLimiter));

  app.get('/admin-test', (req, res) => {
    return res.json({ ok: true, method: 'GET' });
  });

  app.post('/admin-test', (req, res) => {
    return res.json({ ok: true, method: 'POST' });
  });

  return { app, resetAllRateLimits };
}

describe('rate limit middleware', () => {
  afterEach(() => {
    if (originalAdminWriteMax === undefined) {
      delete process.env.RATE_LIMIT_ADMIN_WRITE_MAX;
    } else {
      process.env.RATE_LIMIT_ADMIN_WRITE_MAX = originalAdminWriteMax;
    }

    if (originalAdminWriteWindowMs === undefined) {
      delete process.env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS;
    } else {
      process.env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS = originalAdminWriteWindowMs;
    }

    jest.resetModules();
  });

  test('limitMutatingMethods skips GET requests but throttles repeated POST requests', async () => {
    const { app, resetAllRateLimits } = await createAdminLimiterApp();

    for (let i = 0; i < 5; i++) {
      const response = await request(app).get('/admin-test');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, method: 'GET' });
    }

    const firstPost = await request(app).post('/admin-test').send({ step: 1 });
    const secondPost = await request(app).post('/admin-test').send({ step: 2 });
    const blockedPost = await request(app).post('/admin-test').send({ step: 3 });

    expect(firstPost.status).toBe(200);
    expect(secondPost.status).toBe(200);
    expect(blockedPost.status).toBe(429);
    expect(blockedPost.body).toEqual({
      ok: false,
      msg: 'Bạn thao tác quản trị quá nhanh. Vui lòng thử lại sau.',
    });

    await resetAllRateLimits();
  });
});
