jest.mock('../../config/mail.config', () => ({
  OTP_TTL_MINUTES: 10,
  canUseOtpFallback: jest.fn(() => true),
  sendOtpMail: jest.fn().mockResolvedValue({ id: 'mail_1' }),
}));

const request = require('supertest');
const LocalUser = require('../../models/LocalUser.model');
const usersRouter = require('../../routers/users.route');
const { sendOtpMail } = require('../../config/mail.config');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('../setup/testDb');
const { createRouterApp } = require('../helpers/routerApp');

describe('users auth routes', () => {
  let app;

  beforeAll(async () => {
    await connectTestDb();
    app = createRouterApp(usersRouter, { basePath: '/users' });
  });

  afterEach(async () => {
    sendOtpMail.mockClear();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('POST /users/register renders errors for missing fields', async () => {
    const response = await request(app)
      .post('/users/register')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.view).toBe('./user/register');
    expect(response.body.locals.errors).toEqual(expect.arrayContaining([
      { msg: 'Vui lòng nhập tên đăng nhập' },
      { msg: 'Vui lòng nhập email' },
      { msg: 'Vui lòng nhập mật khẩu' },
      { msg: 'Vui lòng xác nhận mật khẩu' },
    ]));
    expect(sendOtpMail).not.toHaveBeenCalled();
  });

  test('POST /users/register blocks duplicate email or username', async () => {
    await LocalUser.create({
      username: 'takenuser',
      email: 'taken@example.com',
      password: 'hashed',
      name: 'Taken',
      isAuth: true,
    });

    const response = await request(app)
      .post('/users/register')
      .send({
        username: 'takenuser',
        email: 'taken@example.com',
        password: 'secret123',
        password2: 'secret123',
      });

    const messages = response.body.locals.errors.map((error) => error.msg);
    expect(messages).toContain('Email đã được sử dụng, vui lòng dùng email khác');
    expect(messages).toContain('Tên đăng nhập đã tồn tại, vui lòng chọn tên khác');
  });

  test('POST /users/register creates pending user and stores session email', async () => {
    const agent = request.agent(app);
    const response = await agent
      .post('/users/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        password: 'secret123',
        password2: 'secret123',
        gender: 'other',
      });

    expect(response.body.view).toBe('./user/otp');
    expect(sendOtpMail).toHaveBeenCalledWith('new@example.com', expect.stringMatching(/^\d{6}$/));
    const pending = await LocalUser.findOne({ email: 'new@example.com' }).lean();
    expect(pending).toBeTruthy();
    expect(pending.isAuth).toBe(false);
  });

  test('POST /users/otp rejects wrong code and verifies correct code', async () => {
    const agent = request.agent(app);
    await agent
      .post('/users/register')
      .send({
        username: 'otpuser',
        email: 'otp@example.com',
        password: 'secret123',
        password2: 'secret123',
      });

    const pending = await LocalUser.findOne({ email: 'otp@example.com' });

    const wrong = await agent.post('/users/otp').send({ otpNumber: '000000' });
    expect(wrong.body.locals.errors).toEqual([{ msg: 'Mã OTP không đúng, vui lòng thử lại' }]);

    const ok = await agent.post('/users/otp').send({ otpNumber: pending.otpNumber });
    expect(ok.status).toBe(302);
    expect(ok.headers.location).toBe('/');

    const verified = await LocalUser.findById(pending._id).lean();
    expect(verified.isAuth).toBe(true);
    expect(verified.otpNumber).toBeUndefined();
  });

  test('POST /users/otp deletes expired pending user', async () => {
    const agent = request.agent(app);
    await LocalUser.create({
      username: 'expireduser',
      email: 'expired@example.com',
      password: 'hashed',
      name: 'Expired',
      isAuth: false,
      otpNumber: '123456',
      otpExpires: new Date(Date.now() - 1000),
    });
    await agent.post('/__test__/session').send({ currentEmail: 'expired@example.com' });

    const response = await agent.post('/users/otp').send({ otpNumber: '123456' });

    expect(response.body.locals.expired).toBe(true);
    expect(await LocalUser.findOne({ email: 'expired@example.com' })).toBeNull();
  });
});
