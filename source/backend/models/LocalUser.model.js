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
        default: 'guest'
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
        default: 'https://res.cloudinary.com/teamwebctt2/image/upload/v1610695375/webctt2/avatar/default/avatar.png'
    },
    description: {
        type: String,
        default: ''
    },
    zaloPhone: {
        type: String,
        default: ''
    },
    inGameName: {
        type: String,
        default: ''
    },
    rank: {
        type: String,
        enum: ['', 'ban-chuyen', 'chuyen-nghiep', 'the-gioi', 'tinh-anh', 'huyen-thoai', 'thach-dau', 'sieu-sao'],
        default: ''
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
            }],
            enrolledAt: {
                type: Date,
                default: Date.now
            },
            lastLearnedAt: {
                type: Date,
                default: null
            }
        }],
        default: []
    },
    status: {
        type: Boolean,
        default: true
    }
});

LocalUserSchema.index({ email: 1 }, { unique: true });
LocalUserSchema.index({ username: 1 });

const LocalUser = mongoose.models.localusers || mongoose.model('localusers', LocalUserSchema);

module.exports = LocalUser;
