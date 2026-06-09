const bcrypt = require('bcryptjs');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const LocalUser = require('../models/LocalUser.model');

const DEFAULT_AVATAR = 'https://i.ibb.co/NnbNMtSw/default-avatar.png';
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/users/auth/google/callback';
const escapeRegex = (value) => (value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tất cả user đều nằm trong LocalUser, phân biệt bằng role
const attachRole = (user) => {
    if (!user) return user;
    user.roll = user.role !== 'user' ? user.role : false;
    return user;
};

// Tìm theo username (LocalUser) hoặc email (tất cả role)
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

const findAccountByEmail = async (email) => {
    const normalized = (email || '').trim().toLowerCase();
    const user = await LocalUser.findOne({ email: normalized });
    return user ? attachRole(user) : null;
};

const profileEmail = (profile) => {
    if (!profile || !profile.emails || !profile.emails.length) return '';
    return profile.emails[0].value;
};

const profileName = (profile, email) => {
    if (profile && profile.displayName) return profile.displayName;
    if (profile && profile.name) {
        const name = [profile.name.givenName, profile.name.familyName]
            .filter(Boolean).join(' ').trim();
        if (name) return name;
    }
    return email ? email.split('@')[0] : 'Google user';
};

const profileAvatar = (profile) => {
    if (profile && profile.photos && profile.photos.length && profile.photos[0].value) {
        return profile.photos[0].value;
    }
    return DEFAULT_AVATAR;
};

const findOrCreateGoogleUser = async (profile) => {
    const email = profileEmail(profile);
    if (!email) {
        const error = new Error('Google account has no email');
        error.code = 'GOOGLE_EMAIL_MISSING';
        throw error;
    }

    const existing = await findAccountByEmail(email);

    // Admin/Lecturer không được đăng nhập bằng Google
    if (existing && (existing.role === 'admin' || existing.role === 'lecturer')) {
        const error = new Error('Use email/password login for this account');
        error.code = 'GOOGLE_ROLE_BLOCKED';
        throw error;
    }

    let user = existing;
    if (!user) {
        user = new LocalUser({
            email,
            role: 'user',
            provider: 'google',
            status: true,
            isAuth: true
        });
    }

    if (user.status === false) {
        const error = new Error('Your account has been blocked');
        error.code = 'ACCOUNT_BLOCKED';
        throw error;
    }

    user.provider = 'google';
    user.googleId  = profile.id;
    user.email     = email;
    user.name      = profileName(profile, email) || user.name;
    user.avatar    = profileAvatar(profile) || user.avatar;
    await user.save();

    return attachRole(user);
};

const buildLocalStrategy = () => new LocalStrategy({
    usernameField: 'username'
}, async (username, password, done) => {
    try {
        const user = await findAccountByUsername(username);
        if (!user) {
            return done(null, false, { message: 'Tên đăng nhập không tồn tại' });
        }
        if (user.status === false) {
            return done(null, false, { message: 'Tài khoản đã bị khóa' });
        }
        if (!user.password) {
            return done(null, false, { message: 'Tài khoản này không có mật khẩu' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return done(null, false, { message: 'Mật khẩu không đúng' });
        }

        // Admin/lecturer bypass OTP; every normal local account must be verified.
        const bypassOtp = user.role === 'admin' || user.role === 'lecturer';
        if (!bypassOtp && user.isAuth === false) {
            if (!user.otpExpires || new Date() > user.otpExpires) {
                return done(null, false, {
                    message: 'Mã OTP đã hết hạn. Vui lòng đăng ký lại để nhận mã mới.'
                });
            }

            return done(null, false, {
                message: 'Vui lòng xác nhận OTP để đăng nhập',
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

const buildGoogleStrategy = () => new GoogleStrategy({
    clientID:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL:  GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await findOrCreateGoogleUser(profile);
        return done(null, user);
    } catch (error) {
        return done(null, false, { message: error.message });
    }
});

module.exports = function (passport) {
    passport.use('local',    buildLocalStrategy());
    passport.use('customer', buildLocalStrategy());
    passport.use('admin',    buildLocalStrategy());
    passport.use('google',   buildGoogleStrategy());

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
