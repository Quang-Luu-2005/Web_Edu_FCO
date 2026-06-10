const bcrypt = require('bcryptjs');
const LocalStrategy = require('passport-local').Strategy;

const LocalUser = require('../models/LocalUser.model');

const escapeRegex = (value) => (value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const attachRole = (user) => {
  if (!user) return user;
  user.roll = user.role !== 'user' ? user.role : false;
  return user;
};

const findAccountByUsername = async (username) => {
  const identifier = (username || '').trim();
  const email = identifier.toLowerCase();
  const user = await LocalUser.findOne({
    $or: [
      { username: identifier },
      { email },
      { email: identifier },
      { email: { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') } }
    ]
  });
  return user ? attachRole(user) : null;
};

const buildLocalStrategy = () => new LocalStrategy({
  usernameField: 'username'
}, async (username, password, done) => {
  try {
    const user = await findAccountByUsername(username);
    if (!user) {
      return done(null, false, { message: 'Username not found' });
    }
    if (user.status === false) {
      return done(null, false, { message: 'Account is blocked' });
    }
    if (!user.password) {
      return done(null, false, { message: 'This account has no password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return done(null, false, { message: 'Wrong password' });
    }

    const bypassOtp = user.role === 'admin' || user.role === 'lecturer';
    if (!bypassOtp && user.isAuth === false) {
      if (!user.otpExpires || new Date() > user.otpExpires) {
        return done(null, false, {
          message: 'OTP expired. Please register again to get a new code.'
        });
      }

      return done(null, false, {
        message: 'Please verify OTP to log in',
        needsOtp: true,
        email: user.email,
        otpExpires: user.otpExpires
      });
    }

    return done(null, user);
  } catch (error) {
    return done(error);
  }
});

module.exports = function (passport) {
  passport.use('local', buildLocalStrategy());
  passport.use('customer', buildLocalStrategy());
  passport.use('admin', buildLocalStrategy());

  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await LocalUser.findById(id);
      if (user) return done(null, attachRole(user));
      return done(null, false);
    } catch (error) {
      return done(error);
    }
  });
};
