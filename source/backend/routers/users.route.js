const express = require("express");

const Router = express.Router();

const passport = require("passport");

const {
  ensureAuthenticated,
  forwardAuthenticated,
} = require("../config/auth.config");

const LocalUser = require("../models/LocalUser.model");
const Lecturer = require("../models/Lecturer.model");
const Admin = require("../admin/models/Admin.model");

const nodemailer = require("nodemailer");

const { google } = require("googleapis");

const OAuth2 = google.auth.OAuth2;

const crypto = require("crypto");

const bcrypt = require("bcryptjs");

const fs = require("fs");

const path = require("path");

const multer = require("multer");

const cloudinary = require("cloudinary").v2;
const Course = require("../models/Course.model");

const APP_URL = process.env.APP_URL || "http://localhost:8000";

const safeArray = (value) => Array.isArray(value) ? value : [];

const isEmailInUse = async (email) => {
  const [localUser, lecturer, admin] = await Promise.all([
    LocalUser.findOne({ email }),
    Lecturer.findOne({ email }),
    Admin.findOne({ email })
  ]);
  return localUser || lecturer || admin;
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

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const sendGoogleLoginMail = async (email, token) => {
  const confirmUrl = `${APP_URL}/users/auth/google/confirm/${token}`;
  const { error } = await resend.emails.send({
    from: 'WEBCTT2 <onboarding@resend.dev>',
    to: email,
    subject: 'Xác nhận đăng nhập Google - WEBCTT2',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827;margin:0 0 8px">Xác nhận đăng nhập Google</h2>
        <p style="color:#6b7280;margin:0 0 24px">Click nút bên dưới để xác nhận đăng nhập:</p>
        <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Xác nhận đăng nhập</a>
        <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">Link có hiệu lực trong 15 phút.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message);
};

const sendOtpMail = async (email, otpNumber) => {
  const { error } = await resend.emails.send({
    from: 'WEBCTT2 <onboarding@resend.dev>',
    to: email,
    subject: 'Mã xác nhận tài khoản WEBCTT2',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827;margin:0 0 8px">Xác nhận tài khoản</h2>
        <p style="color:#6b7280;margin:0 0 24px">Nhập mã OTP bên dưới để hoàn tất đăng ký. Mã có hiệu lực trong <strong>2 phút</strong>.</p>
        <div style="font-size:40px;font-weight:700;letter-spacing:12px;color:#2563eb;text-align:center;padding:20px;background:#eff6ff;border-radius:8px">
          ${otpNumber}
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">Không chia sẻ mã này cho ai. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message);
};

//GET LOGIN
Router.get("/login", forwardAuthenticated, (req, res) => {
  renderLogin(req, res);
});

//GET register
Router.get("/register", forwardAuthenticated, (req, res) => {
  renderRegister(req, res);
});

Router.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"],
}));

Router.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", async (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return renderLogin(req, res, {
        errors: [{
          msg: (info && info.message) || "Google login failed"
        }]
      });
    }

    try {
      const token = crypto.randomBytes(24).toString("hex");
      user.googleLoginToken = token;
      user.googleLoginTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      await sendGoogleLoginMail(user.email, token);
      req.flash("success_msg", "Check your email to confirm Google login");
      return res.redirect("/users/login");
    } catch (error) {
      console.error("Google login mail error:", error.message);
      user.googleLoginToken = undefined;
      user.googleLoginTokenExpires = undefined;
      await user.save();
      return renderLogin(req, res, {
        errors: [{
          msg: "Cannot send confirmation email. Check mail config."
        }]
      });
    }
  })(req, res, next);
});

Router.get("/auth/google/confirm/:token", async (req, res, next) => {
  try {
    const user = await LocalUser.findOne({
      googleLoginToken: req.params.token,
      googleLoginTokenExpires: { $gt: new Date() }
    });

    if (!user) {
      return renderLogin(req, res, {
        errors: [{
          msg: "Google confirm link expired or invalid"
        }]
      });
    }

    user.googleLoginToken = undefined;
    user.googleLoginTokenExpires = undefined;
    await user.save();

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return next(loginErr);
      }
      return res.redirect(getLandingPath(user));
    });
  } catch (error) {
    return next(error);
  }
});

//POST register
Router.post("/register", async function (req, res) {
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
    newUser.otpNumber = otpNumber;
    newUser.otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 phút
    await newUser.save();

    req.session.currentEmail = email;

    return res.render("./user/otp", {
      isAuthenticated: req.isAuthenticated(),
      user: req.user
    });
  } catch (error) {
    console.error("Register mail error:", error.message);
    return res.render("./user/register", {
      isAuthenticated: req.isAuthenticated(),
      errors: [{ msg: "Không thể gửi email xác nhận. Kiểm tra cấu hình mail." }],
      user: req.user
    });
  }
});

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
      req.flash("success_msg", "Chào mừng đến với WEBCTT2!");
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
  res.render("./user/account", {
    isLocalAccount: req.user.password != undefined ? true : false,
    user: req.user,
    isAuthenticated: req.isAuthenticated()
  });
});

Router.post("/updateInfor", ensureAuthenticated, async (req, res) => {
  let { name, oldPassword, newPassword, confPassword } = req.body;
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

  if (errors.length > 0) {
    return res.json(errors);
  }

  if (name && name.trim()) req.user.name = name.trim();
  if (newPassword && req.user.password != undefined) {
    req.user.password = await bcrypt.hash(newPassword, 10);
  }

  req.user.save().then(() => {
    req.flash("success_msg", "Cập nhật thành công");
    res.json(true);
  });
});

//Upload avatar
Router.post("/updateAvatar", ensureAuthenticated, function (req, res) {
  fs.mkdir(
    path.join(__dirname, "../public/avatar/" + req.user._id.toString()),
    () => {}
  );

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./public/avatar/" + req.user._id.toString());
    },
    filename: function (req, file, cb) {
      let avatar =
        "/public/avatar/" + req.user._id.toString() + "/" + "avatar.png";
      req.user.avatar = avatar;
      req.user.save();
      cb(null, "avatar.png");
    },
  });
  const upload = multer({
    storage,
  });
  upload.single("fuMain")(req, res, async function async(err) {
    if (err) {
      console.log(err);
    } else {
      await res.redirect("/users/account");
    }
  });
});

Router.post("/wish-list-change", ensureAuthenticated, async (req, res) => {
  const courseID = req.body.courseID;
  const wishList = safeArray(req.user.idWishList);
  req.user.idWishList = wishList;

  if (courseID != undefined) {
    const index = wishList.findIndex((id) => id.toString() === courseID.toString());

    if (index === -1) {
      wishList.push(courseID);
    } else {
      wishList.splice(index, 1);
    }

    await req.user.save();
  }

  res.end();
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
