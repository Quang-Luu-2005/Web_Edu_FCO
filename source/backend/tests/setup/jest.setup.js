process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.OTP_FALLBACK_ON_MAIL_ERROR = 'true';
process.env.PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID || 'test-client';
process.env.PAYOS_API_KEY = process.env.PAYOS_API_KEY || 'test-key';
process.env.PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || 'test-checksum';
process.env.PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://example.test';

jest.setTimeout(30000);
