const { getPublicAppUrl } = require('../../utils/publicAppUrl');

const originalEnv = { ...process.env };

function mockReq(headers = {}, secure = false) {
  return {
    secure,
    get(name) {
      return headers[name.toLowerCase()] || headers[name] || '';
    },
  };
}

describe('getPublicAppUrl', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.RAILWAY_STATIC_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('uses configured public URL and normalizes protocol/trailing slash', () => {
    process.env.PUBLIC_APP_URL = 'edu.example.com/';
    expect(getPublicAppUrl()).toBe('https://edu.example.com');
  });

  test('ignores local configured URL when request origin is available', () => {
    process.env.PUBLIC_APP_URL = 'http://localhost:8000';
    const req = mockReq({ host: 'app.example.test', 'x-forwarded-proto': 'https' });
    expect(getPublicAppUrl(req)).toBe('https://app.example.test');
  });

  test('uses railway URL before request origin', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'railway.example.test';
    const req = mockReq({ host: 'request.example.test' });
    expect(getPublicAppUrl(req)).toBe('https://railway.example.test');
  });

  test('falls back to localhost when no source is available', () => {
    expect(getPublicAppUrl()).toBe('http://localhost:8000');
  });
});
