function normalizeUrl(value) {
  const raw = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function isLocalUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value || '');
}

function getRequestOrigin(req) {
  if (!req) return '';

  const host = (req.get('x-forwarded-host') || req.get('host') || '').trim();
  if (!host) return '';

  const proto = (req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http') || 'https')
    .split(',')[0]
    .trim() || 'https';

  return normalizeUrl(`${proto}://${host}`);
}

function getPublicAppUrl(req) {
  const configured = normalizeUrl(process.env.PUBLIC_APP_URL || process.env.APP_URL);
  if (configured && !isLocalUrl(configured)) return configured;

  const railway = normalizeUrl(process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN);
  if (railway) return railway;

  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin) return requestOrigin;

  if (configured) return configured;
  return 'http://localhost:8000';
}

module.exports = {
  getPublicAppUrl
};
