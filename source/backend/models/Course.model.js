const mongoose = require('mongoose');

const ReactionSchema = mongoose.Schema({
    idUser: {
        type: mongoose.Schema.ObjectId,
        required: true
    },
    type: {
        type: String,
        default: 'like'
    },
    date: {
        type: Date,
        default: Date.now
    }
}, {
    _id: false
});

const ReportSchema = mongoose.Schema({
    idUser: {
        type: mongoose.Schema.ObjectId,
        required: true
    },
    reason: {
        type: String,
        default: 'Nội dung vi phạm'
    },
    date: {
        type: Date,
        default: Date.now
    }
}, {
    _id: false
});

const ReplySchema = mongoose.Schema({
    idUser: {
        type: mongoose.Schema.ObjectId,
        required: true
    },
    reply: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    reactions: {
        type: [ReactionSchema],
        default: []
    },
    reports: {
        type: [ReportSchema],
        default: []
    },
    status: {
        type: Boolean,
        default: true
    }
});

const UserReviewSchema = mongoose.Schema({
    idUser: {
        type: mongoose.Schema.ObjectId,
        required: true
    },
    review: String,
    date: {
        type: Date,
        default: Date.now
    },
    reactions: {
        type: [ReactionSchema],
        default: []
    },
    replies: {
        type: [ReplySchema],
        default: []
    },
    reports: {
        type: [ReportSchema],
        default: []
    },
    status: {
        type: Boolean,
        default: true
    }
});

const CourseSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    poster: {
        type: String,
        default: 'https://i.ibb.co/wr2CLVVd/default-poster.png'
    },
    description: {
        type: String,
        default: 'Đây là miêu tả khóa học'
    },
    evaluationPoint: {
        type: Number,
        default: 0
    },
    numberOfEvaluation: {
        type: Number,
        default: 0
    },
    numberOfStudent: {
        type: Number,
        default: 0
    },
    numberOfView: {
        type: Number,
        default: 0
    },
    tuition: {
        type: Number,
        default: 10 //USD
    },
    idCourseTopic: {
        type: mongoose.Schema.ObjectId,
        ref: 'coursetopics'
    },
    uploadDate: {
        type: Date,
        default: Date.now()
    },
    idLecturer: {
        type: mongoose.Schema.ObjectId,
        ref: 'lecturers'
    },
    numberOfVideo: {
        type: Number,
        default: 0
    },
    videos: {
        type: [{
            name: String,
            source: String
        }],
        default: []
    },
    previewIndex: {
        type: [Number],
        default: []
    },
    whatYoullLearn: {
        type: [String],
        default: []
    },
    userEvaluations: {
        type: [{
            idUser: {
                type: mongoose.Schema.ObjectId,
                required: true
            },
            point: {
                type: Number,
                required: true
            }
        }],
        default: []
    },
    userReviews: {
        type: [UserReviewSchema],
        default: []
    },
    status: {
        type: Boolean,
        default: true
    },
    // Mã giảm giá
    discountCodes: {
        type: [{
            code:       { type: String, required: true },
            percent:    { type: Number, default: 0 },   // % giảm
            maxUses:    { type: Number, default: 0 },   // 0 = không giới hạn
            usedCount:  { type: Number, default: 0 },
            expiresAt:  { type: Date,   default: null },
            active:     { type: Boolean, default: true }
        }],
        default: []
    },
    // Buổi học (link + mô tả)
    sessions: {
        type: [{
            title:      { type: String, default: '' },
            link:       { type: String, default: '' },
            date:       { type: Date,   default: null },
            note:       { type: String, default: '' }
        }],
        default: []
    }
});

const Course = mongoose.models.courses || mongoose.model('courses', CourseSchema);

module.exports = Course;
