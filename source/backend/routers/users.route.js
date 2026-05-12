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
const GOOGLE_MAIL_CLIENT_ID = process.env.GOOGLE_MAIL_CLIENT_ID || "520933105747-lvrafi3nq92ia2hv9mkgrdh706sl0ei2.apps.googleusercontent.com";
const GOOGLE_MAIL_CLIENT_SECRET = process.env.GOOGLE_MAIL_CLIENT_SECRET || "NAjZvQbzYipjQYBxnaHPHSr9";
const GOOGLE_MAIL_REFRESH_TOKEN = process.env.GOOGLE_MAIL_REFRESH_TOKEN || "1//04pUalhF17quECgYIARAAGAQSNwF-L9IrtIab8o_JgFJXXg0bnTvA6q_3ODGZ2CxpgzTw2uMFQysLTh_YgX5PY4TWCszQ3ZVENzQ";
const GOOGLE_MAIL_REDIRECT_URI = process.env.GOOGLE_MAIL_REDIRECT_URI || "https://developers.google.com/oauthplayground";
const GOOGLE_MAIL_USER = process.env.GOOGLE_MAIL_USER || "minhthevo123@gmail.com";
const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || GOOGLE_MAIL_USER;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

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

const createMailTransporter = async () => {
  if (SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  if (!GOOGLE_MAIL_CLIENT_ID || !GOOGLE_MAIL_CLIENT_SECRET || !GOOGLE_MAIL_REFRESH_TOKEN || !GOOGLE_MAIL_USER) {
    throw new Error("Mail sender is not configured");
  }

  const oAuth2Client = new OAuth2(
    GOOGLE_MAIL_CLIENT_ID,
    GOOGLE_MAIL_CLIENT_SECRET,
    GOOGLE_MAIL_REDIRECT_URI
  );

  oAuth2Client.setCredentials({
    refresh_token: GOOGLE_MAIL_REFRESH_TOKEN,
  });

  const accessTokenResponse = await oAuth2Client.getAccessToken();
  const accessToken = accessTokenResponse && accessTokenResponse.token
    ? accessTokenResponse.token
    : accessTokenResponse;

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: GOOGLE_MAIL_USER,
      clientId: GOOGLE_MAIL_CLIENT_ID,
      clientSecret: GOOGLE_MAIL_CLIENT_SECRET,
      refreshToken: GOOGLE_MAIL_REFRESH_TOKEN,
      accessToken: accessToken,
    },
  });
};

const sendGoogleLoginMail = async (email, token) => {
  const confirmUrl = `${APP_URL}/users/auth/google/confirm/${token}`;
  const transporter = await createMailTransporter();

  return transporter.sendMail({
    from: `WEBCTT2 <${MAIL_FROM}>`,
    to: email,
    subject: "Confirm Google login",
    text: `Confirm Google login: ${confirmUrl}`,
    html: `<p>Click link below to confirm login:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
  });
};

const sendOtpMail = async (email, otpNumber) => {
  const transporter = await createMailTransporter();

  return transporter.sendMail({
    from: `WEBCTT2 <${MAIL_FROM}>`,
    to: email,
    subject: "Authenticte message",
    text: "Hello form WEBCTT2",
    html: `<h2>This is your OTP number: <b>${otpNumber}</b></h2>`,
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
  const { name, email, password, password2, gender } = req.body;

  let errors = [];

  if (!name || !email || !password || !password2) {
    errors.push({
      msg: "Please enter all fields",
    });
  }

  if (password != password2) {
    errors.push({
      msg: "Passwords do not match",
    });
  }

  if (password && password.length < 6) {
    errors.push({
      msg: "Password must be at least 6 characters",
    });
  }

  if (errors.length > 0) {
    res.render("./user/register", {
      isAuthenticated: req.isAuthenticated(),
      errors,
      user: req.user
    });
  } else {
    try {
      const user = await isEmailInUse(email);
      if (user) {
        errors.push({
          msg: "Account existed, Try another email",
        });
        return res.render("./user/register", {
          isAuthenticated: req.isAuthenticated(),
          errors,
          user: req.user
        });
      }

      const otpNumber = (
        Math.floor(Math.random() * 900000) + 100000
      ).toString();

      await sendOtpMail(email, otpNumber);

      const newUser = new LocalUser();
      newUser.name = name;
      newUser.email = email;
      newUser.password = await bcrypt.hash(password, 10);
      newUser.gender = gender;
      newUser.otpNumber = otpNumber;
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
        errors: [{
          msg: "Cannot send verification email. Check mail config."
        }],
        user: req.user
      });
    }
  }
});

Router.post("/otp", async (req, res) => {
  const otpNumber = req.body.otpNumber;
  const localUser = await LocalUser.findOne({
    email: req.session.currentEmail,
  });
  if (otpNumber == localUser.otpNumber) {
    LocalUser.findOne({
      email: req.session.currentEmail,
    }).then((user) => {
      user.isAuth = true;
      user.save();
      req.flash("success_msg", "OTP correct! You can log in now");
      res.redirect("/users/login");
    });
  } else {
    const errors = [
      {
        msg: "OTP not correct!!",
      },
    ];
    res.render("./user/otp", {
      errors,
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
  let { name, oldPassword, newPassword, confPassword, gender } = req.body;
  let errors = [];

  if (req.user.password != undefined) {
    if (!name || !newPassword || !confPassword || !gender || !oldPassword) {
      errors.push({
        msg: "Please enter all fields",
      });
    } else {
      if (newPassword != confPassword) {
        errors.push({
          msg: "Passwords do not match",
        });
      }

      if (newPassword.length < 6) {
        errors.push({
          msg: "Password must be at least 6 characters",
        });
      }

      await bcrypt.compare(oldPassword, req.user.password).then((isMatch) => {
        if (!isMatch) {
          errors.push({
            msg: "Old password is uncorrect",
          });
        }
      });
    }
  } else if (!name) {
    errors.push({
      msg: "Please enter all fields",
    });
  }

  if (errors.length > 0) {
    await res.json(errors);
  } else {
    req.user.name = name;
    req.user.gender = gender;

    if (req.user.password != undefined) {
      req.user.password = await bcrypt.hash(newPassword, 10);
    }
    req.user.save().then(() => {
      req.flash("success_msg", "Your are updated");
      res.json(true);
    });
  }
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
