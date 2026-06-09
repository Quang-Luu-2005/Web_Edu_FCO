const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';
const MAIL_FROM = process.env.MAIL_FROM || process.env.RESEND_FROM || 'MansterClass <onboarding@resend.dev>';
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);

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
    throw new Error('RESEND_API_KEY is not configured');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: MAIL_FROM,
    to,
    subject,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend mail error');
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
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.warn('[Mail] Resend failed, falling back to SMTP:', resendError.message);
        return sendWithSmtp(payload);
      }
      throw resendError;
    }
  }
  return sendWithSmtp(payload);
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

const buildGoogleLoginHtml = (token) => {
  const confirmUrl = `${APP_URL}/users/auth/google/confirm/${token}`;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
                border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="color:#111827;margin:0 0 8px">Xac nhan dang nhap Google</h2>
      <p style="color:#6b7280;margin:0 0 24px">
        Click nut ben duoi de xac nhan dang nhap:
      </p>
      <a href="${confirmUrl}"
         style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                border-radius:8px;text-decoration:none;font-weight:700">
        Xac nhan dang nhap
      </a>
      <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
        Link co hieu luc trong 15 phut.
      </p>
    </div>
  `;
};

const sendOtpMail = async (email, otpNumber) => {
  return sendMail({
    to: email,
    subject: 'Ma xac nhan tai khoan MansterClass',
    html: buildOtpHtml(otpNumber),
  });
};

const sendGoogleLoginMail = async (email, token) => {
  return sendMail({
    to: email,
    subject: 'Xac nhan dang nhap Google - MansterClass',
    html: buildGoogleLoginHtml(token),
  });
};

module.exports = {
  OTP_TTL_MINUTES,
  sendOtpMail,
  sendGoogleLoginMail,
};
