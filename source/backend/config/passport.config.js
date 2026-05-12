const bcrypt = require('bcryptjs');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const LocalUser = require('../models/LocalUser.model');
const Lecturer = require('../models/Lecturer.model');
const Admin = require('../admin/models/Admin.model');

const DEFAULT_AVATAR = 'https://i.ibb.co/NnbNMtSw/default-avatar.png';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/users/auth/google/callback';

const accountModels = [
    { model: Admin, role: 'admin' },
    { model: Lecturer, role: 'lecturer' },
    { model: LocalUser, role: 'user' }
];

const attachRole = (user, role) => {
    if (!user) {
        return user;
    }

    user.role = user.role || role;
    user.roll = user.role === 'user' ? false : user.role;
    return user;
};

const findAccountByEmail = async (email) => {
    for (const source of accountModels) {
        const user = await source.model.findOne({ email });
        if (user) {
            return attachRole(user, source.role);
        }
    }
    return null;
};

const profileEmail = (profile) => {
    if (!profile || !profile.emails || !profile.emails.length) {
        return '';
    }
    return profile.emails[0].value;
};

const profileName = (profile, email) => {
    if (profile && profile.displayName) {
        return profile.displayName;
    }
    if (profile && profile.name) {
        const name = [profile.name.givenName, profile.name.familyName]
            .filter(Boolean)
            .join(' ')
            .trim();
        if (name) {
            return name;
        }
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

    const existingAccount = await findAccountByEmail(email);
    if (existingAccount && existingAccount.role !== 'user') {
        const error = new Error('Use email/password login for this account');
        error.code = 'GOOGLE_ROLE_BLOCKED';
        throw error;
    }

    let user = existingAccount;
    if (!user) {
        user = new LocalUser({
            email,
            role: 'user',
            provider: 'google',
            status: true
        });
    }

    if (user.status === false) {
        const error = new Error('Your account has been blocked');
        error.code = 'ACCOUNT_BLOCKED';
        throw error;
    }

    user.provider = 'google';
    user.googleId = profile.id;
    user.email = email;
    user.name = profileName(profile, email) || user.name;
    user.avatar = profileAvatar(profile) || user.avatar;
    await user.save();

    return attachRole(user, 'user');
};

const buildLocalStrategy = () => new LocalStrategy({
    usernameField: 'email'
}, async (email, password, done) => {
    try {
        const user = await findAccountByEmail(email);
        if (!user) {
            return done(null, false, { message: 'That email is not registered' });
        }

        if (user.status === false) {
            return done(null, false, { message: 'Your account has been blocked' });
        }

        if (!user.password) {
            return done(null, false, { message: 'This account has no password login' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return done(null, false, { message: 'Password incorrect' });
        }

        if (user.role === 'user' && user.isAuth === false) {
            return done(null, false, {
                message: 'Please fill correct OTP to login',
                needsOtp: true,
                email: user.email
            });
        }

        return done(null, user);
    } catch (error) {
        return done(error);
    }
});

const buildGoogleStrategy = () => new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await findOrCreateGoogleUser(profile);
        return done(null, user);
    } catch (error) {
        return done(null, false, { message: error.message });
    }
});

module.exports = function (passport) {
    passport.use('local', buildLocalStrategy());
    passport.use('customer', buildLocalStrategy());
    passport.use('admin', buildLocalStrategy());
    passport.use('google', buildGoogleStrategy());

    passport.serializeUser(function (user, done) {
        done(null, user._id);
    });

    passport.deserializeUser(async function (id, done) {
        try {
            for (const source of accountModels) {
                const user = await source.model.findById(id);
                if (user) {
                    return done(null, attachRole(user, source.role));
                }
            }
            return done(null, false);
        } catch (error) {
            return done(error);
        }
    });
};
