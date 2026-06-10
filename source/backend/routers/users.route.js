const express = require("express");

const Router = express.Router();

const passport = require("passport");

const {
  ensureAuthenticated,
  forwardAuthenticated,
} = require("../config/auth.config");

const LocalUser = require("../models/LocalUser.model");

const nodemailer = require("nodemailer");

const bcrypt = require("bcryptjs");

const fs = require("fs");

const path = require("path");

const multer = require("multer");

const cloudinary = require("cloudinary").v2;
const Course = require("../models/Course.model");

const safeArray = (value) => Array.isArray(value) ? value : [];

const normalizeEmail = (value) => (value || '').trim().toLowerCase();
const normalizeUsername = (value) => (value || '').trim();

const isEmailInUse = async (email) => {
  return await LocalUser.findOne({ email });
};

const getLandingPath = (user) => {
  if (user && (user.role === "admin" || user.role === "lecturer")) {
    return "/admin/homepage";
  }
  return "/";
};

const renderLogin = (req, res, extra = {}) => {
  res.render("./user/login", {
    ...extra,
    isAuthenticated: req.isAuthenticated(),
    user: req.user
  });
};

const renderRegister = (req, res, extra = {}) => {
  res.render("./user/register", {
    ...extra,
    isAuthenticated: req.isAuthenticated(),
    user: req.user
  });
};

const {
  OTP_TTL_MINUTES,
  canUseOtpFallback,
  sendOtpMail
} = require('../config/mail.config');

const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;

const renderOtp = (req, res, extra = {}) => {
  res.render("./user/otp", {
    ...extra,
    otpTtlSeconds: Math.floor(OTP_TTL_MS / 1000),
    otpTtlMinutes: OTP_TTL_MINUTES,
    isAuthenticated: req.isAuthenticated(),
    user: req.user
  });
};

//GET LOGIN
Router.get("/login", forwardAuthenticated, (req, res) => {
  renderLogin(req, res);
});

//GET register
Router.get("/register", forwardAuthenticated, (req, res) => {
  renderRegister(req, res);
});

Router.post("/register", async function (req, res) {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const { password, password2, gender } = req.body;

  let errors = [];

  if (!username) errors.push({ msg: "Vui lòng nhập tên đăng nhập" });
  if (!email) errors.push({ msg: "Vui lòng nhập email" });
  if (!password) errors.push({ msg: "Vui lòng nhập mật khẩu" });
  if (!password2) errors.push({ msg: "Vui lòng xác nhận mật khẩu" });

  if (errors.length > 0) {
    return renderRegister(req, res, {
      errors,
      username,
      email
    });
  }

  if (username.length < 4) {
    errors.push({ msg: "Tên đăng nhập phải có ít nhất 4 ký tự" });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push({ msg: "Tên đăng nhập chỉ được dùng chữ, số và dấu _" });
  }

  if (password !== password2) {
    errors.push({ msg: "Mật khẩu không khớp" });
  }

  if (password.length < 6) {
    errors.push({ msg: "Mật khẩu phải có ít nhất 6 ký tự" });
  }

  if (errors.length > 0) {
    return renderRegister(req, res, {
      errors,
      username,
      email
    });
  }

  try {
    const now = new Date();
    await LocalUser.deleteMany({
      isAuth: false,
      otpExpires: { $lt: now },
      $or: [{ email }, { username }]
    });

    const [existEmail, existUsername] = await Promise.all([
      LocalUser.findOne({ email }),
      LocalUser.findOne({ username })
    ]);

    let pendingUser = null;
    if (existEmail && existEmail.isAuth === false) {
      pendingUser = existEmail;
    }
    if (existUsername && existUsername.isAuth === false) {
      if (pendingUser && pendingUser._id.toString() !== existUsername._id.toString()) {
        errors.push({ msg: "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác" });
      } else {
        pendingUser = existUsername;
      }
    }

    if (existEmail && (!pendingUser || existEmail._id.toString() !== pendingUser._id.toString())) {
      errors.push({ msg: "Email đã được sử dụng, vui lòng dùng email khác" });
    }

    if (existUsername && (!pendingUser || existUsername._id.toString() !== pendingUser._id.toString())) {
      errors.push({ msg: "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác" });
    }

    if (errors.length > 0) {
      return renderRegister(req, res, {
        errors,
        username,
        email
      });
    }

    const otpNumber = (Math.floor(Math.random() * 900000) + 100000).toString();
    const userToVerify = pendingUser || new LocalUser();
    userToVerify.username = username;
    userToVerify.name = username;
    userToVerify.email = email;
    userToVerify.password = await bcrypt.hash(password, 10);
    userToVerify.gender = gender || 'other';
    userToVerify.role = userToVerify.role || 'guest';
    userToVerify.isAuth = false;
    userToVerify.otpNumber = otpNumber;
    userToVerify.otpExpires = new Date(Date.now() + OTP_TTL_MS);
    await userToVerify.save();

    let mailWarning = '';
    let otpDebugCode = '';
    try {
      await sendOtpMail(email, otpNumber);
    } catch (mailError) {
      console.warn('[Register] OTP mail not delivered, using fallback:', mailError.message);
      if (!canUseOtpFallback(mailError)) {
        await LocalUser.deleteOne({ _id: userToVerify._id, isAuth: false });
        throw mailError;
      }
      mailWarning = 'Email OTP chưa gửi được vì dịch vụ mail chưa cấu hình gửi thật. Dùng mã tạm thời bên dưới để tiếp tục.';
      otpDebugCode = otpNumber;
    }

    req.session.currentEmail = email;

    return renderOtp(req, res, {
      otpExpires: userToVerify.otpExpires,
      mailWarning,
      otpDebugCode
    });
  } catch (error) {
    console.error("[Register] Lỗi gửi mail OTP:", error.message, error.stack);
    return renderRegister(req, res, {
      errors: [{ msg: `Không thể gửi email xác nhận: ${error.message}` }],
      username,
      email
    });
  }
});

//POST register
Router.post("/register-legacy-disabled", async function (req, res) {
  const { username, email, password, password2, gender } = req.body;

  let errors = [];

  if (!username || !username.trim()) errors.push({ msg: "Vui lòng nhập tên đăng nhập" });
  if (!email    || !email.trim())    errors.push({ msg: "Vui lòng nhập email" });
  if (!password)                     errors.push({ msg: "Vui lòng nhập mật khẩu" });
  if (!password2)                    errors.push({ msg: "Vui lòng xác nhận mật khẩu" });

  if (errors.length > 0) {
    return res.render("./user/register", {
      isAuthenticated: req.isAuthenticated(),
      errors, user: req.user, username, email
    });
  }

  if (username.trim().length < 4) {
    errors.push({ msg: "Tên đăng nhập phải có ít nhất 4 ký tự" });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    errors.push({ msg: "Tên đăng nhập chỉ được dùng chữ, số và dấu _" });
  }

  if (password !== password2) {
    errors.push({ msg: "Mật khẩu không khớp" });
  }

  if (password.length < 6) {
    errors.push({ msg: "Mật khẩu phải có ít nhất 6 ký tự" });
  }

  if (errors.length > 0) {
    return res.render("./user/register", {
      isAuthenticated: req.isAuthenticated(),
      errors, user: req.user, username, email
    });
  }

  try {
    const existEmail = await isEmailInUse(email);
    if (existEmail) {
      errors.push({ msg: "Email đã được sử dụng, vui lòng dùng email khác" });
      return res.render("./user/register", {
        isAuthenticated: req.isAuthenticated(),
        errors, user: req.user, username, email
      });
    }

    const existUsername = await LocalUser.findOne({ username: username.trim() });
    if (existUsername) {
      errors.push({ msg: "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác" });
      return res.render("./user/register", {
        isAuthenticated: req.isAuthenticated(),
        errors, user: req.user, username, email
      });
    }

    const otpNumber = (Math.floor(Math.random() * 900000) + 100000).toString();
    await sendOtpMail(email, otpNumber);

    const newUser = new LocalUser();
    newUser.username = username.trim();
    newUser.name = username.trim();
    newUser.email = email;
    newUser.password = await bcrypt.hash(password, 10);
    newUser.gender = gender || 'other';
    newUser.role = 'guest';
    newUser.otpNumber = otpNumber;
    newUser.otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 phút
    await newUser.save();

    req.session.currentEmail = email;

    return res.render("./user/otp", {
      isAuthenticated: req.isAuthenticated(),
      user: req.user
    });
  } catch (error) {
    console.error("[Register] Lỗi gửi mail OTP:", error.message, error.stack);
    return res.render("./user/register", {
      isAuthenticated: req.isAuthenticated(),
      errors: [{ msg: `Không thể gửi email xác nhận: ${error.message}` }],
      user: req.user,
      username,
      email
    });
  }
});

Router.post("/otp", async (req, res) => {
  const otpNumber = req.body.otpNumber;
  const localUser = await LocalUser.findOne({
    email: req.session.currentEmail,
  });

  if (!localUser) {
    return renderOtp(req, res, {
      errors: [{ msg: "Phiên đã hết hạn, vui lòng đăng ký lại" }]
    });
  }

  if (!localUser.otpExpires || new Date() > localUser.otpExpires) {
    await LocalUser.deleteOne({ _id: localUser._id });
    req.session.currentEmail = undefined;
    return renderOtp(req, res, {
      errors: [{ msg: `Mã OTP đã hết hạn (${OTP_TTL_MINUTES} phút). Vui lòng đăng ký lại.` }],
      expired: true
    });
  }

  if (otpNumber == localUser.otpNumber) {
    localUser.isAuth = true;
    localUser.otpNumber = undefined;
    localUser.otpExpires = undefined;
    await localUser.save();

    req.session.currentEmail = undefined;

    req.logIn(localUser, (err) => {
      if (err) {
        req.flash("success_msg", "Xác nhận thành công! Vui lòng đăng nhập.");
        return res.redirect("/users/login");
      }
      req.flash("success_msg", "Chào mừng đến với MansterClass!");
      return res.redirect("/");
    });
  } else {
    return renderOtp(req, res, {
      errors: [{ msg: "Mã OTP không đúng, vui lòng thử lại" }],
      otpExpires: localUser.otpExpires,
      otpTtlSeconds: Math.max(0, Math.floor((localUser.otpExpires.getTime() - Date.now()) / 1000)),
      otpTtlMinutes: OTP_TTL_MINUTES
    });
  }
});

Router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      if (info && info.needsOtp) {
        req.session.currentEmail = info.email || req.body.email;
        return renderOtp(req, res, {
          errors: [{
            msg: info.message || "Vui lòng nhập OTP để đăng nhập"
          }],
          otpExpires: info.otpExpires
        });
      }

      return renderLogin(req, res, {
        errors: [{
          msg: (info && info.message) || "Invalid account"
        }]
      });
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return next(loginErr);
      }

      return res.redirect(getLandingPath(user));
    });
  })(req, res, next);
});

// legacy handler below
Router.post("/otp", async (req, res) => {
  const otpNumber = req.body.otpNumber;
  const localUser = await LocalUser.findOne({
    email: req.session.currentEmail,
  });

  if (!localUser) {
    return res.render("./user/otp", {
      errors: [{ msg: "Phiên hết hạn, vui lòng đăng ký lại" }],
      isAuthenticated: req.isAuthenticated(),
      user: req.user
    });
  }

  // Kiểm tra timeout 2 phút
  if (!localUser.otpExpires || new Date() > localUser.otpExpires) {
    // Xóa user chưa xác thực để cho phép đăng ký lại
    await LocalUser.deleteOne({ _id: localUser._id });
    req.session.currentEmail = undefined;
    return res.render("./user/otp", {
      errors: [{ msg: "Mã OTP đã hết hạn (2 phút). Vui lòng đăng ký lại." }],
      expired: true,
      isAuthenticated: req.isAuthenticated(),
      user: req.user
    });
  }

  if (otpNumber == localUser.otpNumber) {
    localUser.isAuth = true;
    localUser.otpNumber = undefined;
    localUser.otpExpires = undefined;
    await localUser.save();

    req.session.currentEmail = undefined;

    req.logIn(localUser, (err) => {
      if (err) {
        req.flash("success_msg", "Xác nhận thành công! Vui lòng đăng nhập.");
        return res.redirect("/users/login");
      }
      req.flash("success_msg", "Chào mừng đến với MansterClass!");
      return res.redirect("/");
    });
  } else {
    res.render("./user/otp", {
      errors: [{ msg: "Mã OTP không đúng, vui lòng thử lại" }],
      otpExpires: localUser.otpExpires,
      isAuthenticated: req.isAuthenticated(),
      user: req.user
    });
  }
});

Router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      if (info && info.needsOtp) {
        req.session.currentEmail = info.email || req.body.email;
        return res.render("./user/otp", {
          errors: [{
            msg: info.message || "Please fill correct OTP to login"
          }],
          isAuthenticated: req.isAuthenticated(),
          user: req.user
        });
      }

      return renderLogin(req, res, {
        errors: [{
          msg: (info && info.message) || "Invalid account"
        }]
      });
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return next(loginErr);
      }

      return res.redirect(getLandingPath(user));
    });
  })(req, res, next);
});

Router.get("/logout", (req, res) => {
  req.flash("success_msg", "You now log out");
  req.logout();
  res.redirect("/");
});

Router.get("/account", ensureAuthenticated, (req, res) => {
  const { RANK_LEVELS, isProfileCompleteForPractice } = require('../config/practice.config');
  res.render("./user/account", {
    isLocalAccount: req.user.password != undefined ? true : false,
    user: req.user,
    isAuthenticated: req.isAuthenticated(),
    rankLevels: RANK_LEVELS,
    profileCompleteForPractice: isProfileCompleteForPractice(req.user)
  });
});

Router.post("/updateInfor", ensureAuthenticated, express.json(), async (req, res) => {
  let { name, gender, description, oldPassword, newPassword, confPassword, zaloPhone, inGameName, rank } = req.body;
  let errors = [];

  if (req.user.password != undefined) {
    // Có password local — chỉ validate password nếu user muốn đổi
    if (newPassword || confPassword || oldPassword) {
      if (!oldPassword) errors.push({ msg: "Vui lòng nhập mật khẩu cũ" });
      if (!newPassword) errors.push({ msg: "Vui lòng nhập mật khẩu mới" });
      if (!confPassword) errors.push({ msg: "Vui lòng xác nhận mật khẩu mới" });

      if (newPassword && confPassword && newPassword !== confPassword) {
        errors.push({ msg: "Mật khẩu mới không khớp" });
      }
      if (newPassword && newPassword.length < 6) {
        errors.push({ msg: "Mật khẩu phải có ít nhất 6 ký tự" });
      }
      if (oldPassword && errors.length === 0) {
        const isMatch = await bcrypt.compare(oldPassword, req.user.password);
        if (!isMatch) errors.push({ msg: "Mật khẩu cũ không đúng" });
      }
    }
  }

  // Validate rank
  const { RANK_VALUES } = require('../config/practice.config');
  if (rank !== undefined && rank !== null && rank !== '' && !RANK_VALUES.includes(rank)) {
    errors.push({ msg: "Mức rank không hợp lệ" });
  }

  // Validate zalo phone (optional, but if provided must be 9-12 digits)
  if (zaloPhone !== undefined && zaloPhone !== null && zaloPhone !== '') {
    const phoneClean = String(zaloPhone).trim().replace(/[\s.-]/g, '');
    if (!/^\+?\d{9,12}$/.test(phoneClean)) {
      errors.push({ msg: "Số điện thoại Zalo không hợp lệ" });
    }
  }

  if (errors.length > 0) {
    return res.json(errors);
  }

  // Build update object — luôn update gender nếu có giá trị hợp lệ
  const update = {};
  if (name && name.trim())      update.name   = name.trim();
  if (gender && ['male','female','other'].includes(gender)) {
    update.gender = gender;
  } else if (gender !== undefined && gender !== null && gender !== '') {
    console.warn('[updateInfor] invalid gender value:', JSON.stringify(gender));
  }
  if (typeof description === 'string') update.description = description.trim().slice(0, 500);
  if (typeof zaloPhone === 'string')   update.zaloPhone   = zaloPhone.trim().replace(/[\s.-]/g, '').slice(0, 20);
  if (typeof inGameName === 'string')  update.inGameName  = inGameName.trim().slice(0, 60);
  if (typeof rank === 'string' && (rank === '' || RANK_VALUES.includes(rank))) {
    update.rank = rank;
  }
  if (newPassword && req.user.password != undefined) {
    update.password = await bcrypt.hash(newPassword, 10);
  }

  console.log('[updateInfor] update to apply:', update);

  if (Object.keys(update).length === 0) {
    return res.json(true);
  }

  try {
    const updated = await LocalUser.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true }
    );
    if (!updated) {
      return res.json([{ msg: 'Không tìm thấy tài khoản' }]);
    }
    await new Promise((resolve, reject) => {
      req.logIn(updated, err => err ? reject(err) : resolve());
    });
    return res.json(true);
  } catch (e) {
    console.error('updateInfor save error:', e.message);
    return res.json([{ msg: 'Lỗi lưu dữ liệu, thử lại sau.' }]);
  }
});

//Upload avatar — nhận URL từ ImgBB (upload thẳng từ browser)
Router.post("/updateAvatar", ensureAuthenticated, express.json(), async (req, res) => {
  const { avatarUrl } = req.body;
  if (!avatarUrl || typeof avatarUrl !== 'string' || !avatarUrl.startsWith('http')) {
    return res.json(false);
  }
  try {
    const updated = await LocalUser.findByIdAndUpdate(
      req.user._id,
      { $set: { avatar: avatarUrl } },
      { new: true }
    );
    if (!updated) return res.json(false);
    await new Promise((resolve, reject) => {
      req.logIn(updated, err => err ? reject(err) : resolve());
    });
    return res.json(true);
  } catch (e) {
    console.error('updateAvatar error:', e.message);
    return res.json(false);
  }
});

const VerificationRequest = require('../models/VerificationRequest.model');

Router.post("/verify-student", ensureAuthenticated, express.json(), async (req, res) => {
  const { proofImageUrl, note } = req.body;

  if (!proofImageUrl || typeof proofImageUrl !== 'string' || !proofImageUrl.startsWith('http')) {
    return res.json({ ok: false, msg: 'URL ảnh không hợp lệ' });
  }

  // Chỉ cho phép nếu chưa là lecturer/admin và chưa có request pending
  if (req.user.role !== 'guest') {
    return res.json({ ok: false, msg: 'Chỉ tài khoản Khách mới cần xác nhận' });
  }

  const existing = await VerificationRequest.findOne({
    userId: req.user._id,
    status: 'pending'
  });
  if (existing) {
    return res.json({ ok: false, msg: 'Bạn đã có yêu cầu đang chờ xử lý' });
  }

  await VerificationRequest.create({
    userId: req.user._id,
    proofImageUrl,
    note: (note || '').trim().slice(0, 500)
  });

  return res.json({ ok: true });
});

Router.get("/verify-student/status", ensureAuthenticated, async (req, res) => {
  const latest = await VerificationRequest.findOne({ userId: req.user._id })
    .sort({ createdAt: -1 });
  return res.json({ request: latest || null });
}); 

Router.post("/wish-list-change", ensureAuthenticated, async (req, res) => {
  const courseID = req.body.courseID;
  const wishList = safeArray(req.user.idWishList);
  req.user.idWishList = wishList;

  if (!courseID) {
    return res.json({ ok: false, msg: 'Thiếu courseID' });
  }

  const index = wishList.findIndex((id) => id.toString() === courseID.toString());
  const added = index === -1;

  if (added) wishList.push(courseID);
  else       wishList.splice(index, 1);

  try {
    await req.user.save();
    return res.json({ ok: true, added, count: wishList.length });
  } catch (e) {
    console.error('wish-list-change error:', e.message);
    return res.json({ ok: false, msg: 'Lỗi lưu dữ liệu' });
  }
});

Router.post("/:nameCourse/updateLearnedVideo", ensureAuthenticated, async (req, res) => {
  const videoIndex = Number(req.body.videoIndex);
  const course = await Course.findOne({
    name: req.params.nameCourse,
  });

  if (!course || !Number.isFinite(videoIndex)) {
    return res.json(false);
  }

  let flag = false;
  const purchasedCourses = safeArray(req.user.purchasedCourses);
  req.user.purchasedCourses = purchasedCourses;

  for (let i = 0; i < purchasedCourses.length; i++) {
    const learnedVideos = safeArray(purchasedCourses[i].learnedVideos);
    purchasedCourses[i].learnedVideos = learnedVideos;

    if (purchasedCourses[i].idCourse.toString() == course._id
        && learnedVideos.indexOf(videoIndex) == -1) {
      learnedVideos.push(videoIndex);
      purchasedCourses[i].lastLearnedAt = new Date();
      await req.user.save();
      res.json(true);
      flag = true;
      break;
    }
  }
  if (!flag) {
    res.json(false);
  }
});

module.exports = Router;
