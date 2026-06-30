const express = require('express');

const router = express.Router();
const SupportTicket = require('../models/SupportTicket.model');
const { supportLimiter } = require('../middlewares/rateLimit.mdw');

router.post('/', supportLimiter, async (req, res) => {
  const pageUrl = (req.body.pageUrl || req.get('Referer') || '').toString().trim();
  const errorType = (req.body.errorType || 'unknown').toString().trim();
  const message = (req.body.message || 'User requested support from an error page').toString().trim();

  if (!pageUrl) {
    return res.status(400).json({ ok: false, msg: 'Missing pageUrl' });
  }

  await SupportTicket.create({
    userId: req.user && req.user._id ? req.user._id : null,
    pageUrl: pageUrl.slice(0, 1000),
    errorType: errorType.slice(0, 50),
    message: message.slice(0, 500),
    userAgent: (req.get('User-Agent') || '').slice(0, 500),
    ip: ((req.headers['x-forwarded-for'] || req.ip || '') + '').slice(0, 100)
  });

  return res.json({ ok: true });
});

module.exports = router;
