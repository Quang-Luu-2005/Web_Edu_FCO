const nodemailer = require('nodemailer');

const APP_URL = process.env.APP_URL || 'http://localhost:8000';

// Tạo transporter dùng Gmail SMTP + App Password
const createTransporter = () =>
  nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

/**
 * Gửi OTP xác nhận đăng ký
 */
const sendOtpMail = async (email, otpNumber) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"WEBCTT2" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Mã xác nhận tài khoản WEBCTT2',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
                  border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827;margin:0 0 8px">Xác nhận tài khoản</h2>
        <p style="color:#6b7280;margin:0 0 24px">
          Nhập mã OTP bên dưới để hoàn tất đăng ký.
          Mã có hiệu lực trong <strong>2 phút</strong>.
        </p>
        <div style="font-size:40px;font-weight:700;letter-spacing:12px;color:#2563eb;
                    text-align:center;padding:20px;background:#eff6ff;border-radius:8px">
          ${otpNumber}
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
          Không chia sẻ mã này cho ai. Nếu bạn không yêu cầu, hãy bỏ qua email này.
        </p>
      </div>
    `,
  });
};

/**
 * Gửi link xác nhận đăng nhập Google
 */
const sendGoogleLoginMail = async (email, token) => {
  const confirmUrl = `${APP_URL}/users/auth/google/confirm/${token}`;
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"WEBCTT2" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Xác nhận đăng nhập Google - WEBCTT2',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
                  border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827;margin:0 0 8px">Xác nhận đăng nhập Google</h2>
        <p style="color:#6b7280;margin:0 0 24px">
          Click nút bên dưới để xác nhận đăng nhập:
        </p>
        <a href="${confirmUrl}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                  border-radius:8px;text-decoration:none;font-weight:700">
          Xác nhận đăng nhập
        </a>
        <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
          Link có hiệu lực trong 15 phút.
        </p>
      </div>
    `,
  });
};

module.exports = { sendOtpMail, sendGoogleLoginMail };
