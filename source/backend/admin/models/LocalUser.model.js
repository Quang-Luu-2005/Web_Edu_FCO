const mongoose = require('mongoose');

const LocalUserSchema = mongoose.Schema({
    username: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        reuqired: true
    },
    provider: {
        type: String,
        default: 'local'
    },
    googleId: {
        type: String
    },
    name: {
        type: String,
        requried: true
    },
    role: {
        type: String,
        default: 'user'
    },
    gender: {
        type: String,
        default: 'female'
    },
    date: {
        type: Date,
        default: Date.now()
    },
    avatar: {
        type: String,
        default: 'https://i.ibb.co/NnbNMtSw/default-avatar.png'
    }, 
    isAuth: {
        type: Boolean,
        default: false
    },
    otpNumber: {
        type: String
    },
    otpExpires: {
        type: Date
    },
    googleLoginToken: {
        type: String
    },
    googleLoginTokenExpires: {
        type: Date
    },
    idCourses: {
        type: [mongoose.Schema.ObjectId],
        ref: 'courses',
        default: []
    },
    idWishList: {
        type: [mongoose.Schema.ObjectId],
        ref: 'courses',
        default: []
    },
    purchasedCourses: {
        type: [{
            idCourse: {
                type: mongoose.Schema.ObjectId,
                ref: 'courses'
            },
            learnedVideos: [{
                type: Number
            }]
        }],
        default: []
    },
    status: {
        type: Boolean,
        default: true,
    },
});

const LocalUser = mongoose.models.localusers || mongoose.model('localusers', LocalUserSchema);

module.exports = LocalUser;
