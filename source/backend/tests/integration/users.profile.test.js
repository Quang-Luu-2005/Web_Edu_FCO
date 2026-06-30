const request = require('supertest');
const bcrypt = require('bcryptjs');
const LocalUser = require('../../models/LocalUser.model');
const Course = require('../../models/Course.model');
const usersRouter = require('../../routers/users.route');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('../setup/testDb');
const { createRouterApp, resetAllRateLimits } = require('../helpers/routerApp');

describe('users profile routes', () => {
  let currentUserId;
  let app;

  beforeAll(async () => {
    await connectTestDb();
    app = createRouterApp(usersRouter, {
      basePath: '/users',
      resolveUser: () => currentUserId ? LocalUser.findById(currentUserId) : null,
    });
  });

  beforeEach(async () => {
    const user = await LocalUser.create({
      username: 'profileuser',
      email: 'profile@example.com',
      password: await bcrypt.hash('oldpass123', 10),
      name: 'Profile User',
      isAuth: true,
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

  test('POST /users/updateInfor validates phone, rank and password confirmation', async () => {
    const response = await request(app)
      .post('/users/updateInfor')
      .send({
        oldPassword: 'oldpass123',
        newPassword: 'newpass123',
        confPassword: 'different',
        zaloPhone: 'abc',
        rank: 'invalid-rank',
      });

    expect(response.status).toBe(200);
    const messages = response.body.map((error) => error.msg);
    expect(messages).toContain('Mật khẩu mới không khớp');
    expect(messages).toContain('Mức rank không hợp lệ');
    expect(messages).toContain('Số điện thoại Zalo không hợp lệ');
  });

  test('POST /users/updateInfor updates profile and refreshes login user', async () => {
    const response = await request(app)
      .post('/users/updateInfor')
      .send({
        name: 'Updated User',
        gender: 'other',
        description: 'Hello',
        zaloPhone: '090 123 4567',
        inGameName: 'FCOPlayer',
        rank: 'sieu-sao',
      });

    expect(response.body).toBe(true);
    const updated = await LocalUser.findById(currentUserId).lean();
    expect(updated.name).toBe('Updated User');
    expect(updated.zaloPhone).toBe('0901234567');
    expect(updated.rank).toBe('sieu-sao');
  });

  test('POST /users/wish-list-change toggles course wishlist', async () => {
    const course = await Course.create({ name: 'Wishlist Course' });

    const addResponse = await request(app)
      .post('/users/wish-list-change')
      .send({ courseID: course._id.toString() });
    expect(addResponse.body).toEqual({ ok: true, added: true, count: 1 });

    const removeResponse = await request(app)
      .post('/users/wish-list-change')
      .send({ courseID: course._id.toString() });
    expect(removeResponse.body).toEqual({ ok: true, added: false, count: 0 });
  });

  test('POST /users/:nameCourse/updateLearnedVideo is rate limited after repeated updates', async () => {
    const course = await Course.create({ name: 'Progress Course' });
    await LocalUser.findByIdAndUpdate(currentUserId, {
      $set: {
        purchasedCourses: [{
          idCourse: course._id,
          courseType: 'hour',
          learnedVideos: [],
        }],
      },
    });

    for (let i = 0; i < 10; i++) {
      const response = await request(app)
        .post(`/users/${encodeURIComponent(course.name)}/updateLearnedVideo`)
        .send({ videoIndex: i });

      expect(response.status).toBe(200);
      expect(response.body).toBe(true);
    }

    const blocked = await request(app)
      .post(`/users/${encodeURIComponent(course.name)}/updateLearnedVideo`)
      .send({ videoIndex: 10 });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      ok: false,
      msg: 'Bạn thao tác quá nhanh. Vui lòng chậm lại một chút.',
    });
  });
});
