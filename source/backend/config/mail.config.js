const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const MAIL_FROM = process.env.MAIL_FROM || process.env.RESEND_FROM || 'MansterClass <onboarding@resend.dev>';
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const OTP_FALLBACK_ON_MAIL_ERROR = process.env.OTP_FALLBACK_ON_MAIL_ERROR !== 'false';
const SMTP_FALLBACK_ENABLED = process.env.SMTP_FALLBACK_ENABLED === 'true';

class MailDeliveryError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MailDeliveryError';
    this.code = options.code || 'MAIL_DELIVERY_FAILED';
    this.provider = options.provider || 'unknown';
    this.recoverable = options.recoverable !== false;
    this.cause = options.cause;
  }
}

const isResendSandboxError = (error) => {
  const msg = (error && error.message || '').toLowerCase();
  return msg.includes('only send testing emails to your own email address')
    || msg.includes('verify a domain');
};

const createTransporter = () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER/SMTP_PASS are not configured');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

const sendWithResend = async ({ to, subject, html }) => {
  if (!process.env.RESEND_API_KEY) {
    throw new MailDeliveryError('RESEND_API_KEY is not configured', {
      code: 'RESEND_NOT_CONFIGURED',
      provider: 'resend',
    });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: MAIL_FROM,
    to,
    subject,
    html,
  });

  if (result.error) {
    const message = result.error.message || 'Resend mail error';
    throw new MailDeliveryError(message, {
      code: isResendSandboxError(result.error) ? 'RESEND_SANDBOX_RECIPIENT_BLOCKED' : 'RESEND_SEND_FAILED',
      provider: 'resend',
      recoverable: true,
      cause: result.error,
    });
  }

  return result.data;
};

const sendWithSmtp = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  return transporter.sendMail({
    from: `"MansterClass" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
};

const sendMail = async (payload) => {
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendWithResend(payload);
    } catch (resendError) {
      if (isResendSandboxError(resendError)) {
        throw resendError;
      }

      if (SMTP_FALLBACK_ENABLED && process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.warn('[Mail] Resend failed, falling back to SMTP:', resendError.message);
        return sendWithSmtp(payload);
      }

      throw resendError;
    }
  }
  return sendWithSmtp(payload);
};

const canUseOtpFallback = (error) => {
  return OTP_FALLBACK_ON_MAIL_ERROR && (!error || error.recoverable !== false);
};

const buildOtpHtml = (otpNumber) => `
  <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
              border:1px solid #e5e7eb;border-radius:12px">
    <h2 style="color:#111827;margin:0 0 8px">Xac nhan tai khoan</h2>
    <p style="color:#6b7280;margin:0 0 24px">
      Nhap ma OTP ben duoi de hoan tat dang ky.
      Ma co hieu luc trong <strong>${OTP_TTL_MINUTES} phut</strong>.
    </p>
    <div style="font-size:40px;font-weight:700;letter-spacing:12px;color:#2563eb;
                text-align:center;padding:20px;background:#eff6ff;border-radius:8px">
      ${otpNumber}
    </div>
    <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
      Khong chia se ma nay cho ai. Neu ban khong yeu cau, hay bo qua email nay.
    </p>
  </div>
`;

const sendOtpMail = async (email, otpNumber) => {
  return sendMail({
    to: email,
    subject: 'Ma xac nhan tai khoan MansterClass',
    html: buildOtpHtml(otpNumber),
  });
};

module.exports = {
  OTP_TTL_MINUTES,
  canUseOtpFallback,
  sendOtpMail,
};
