const mongoose = require('mongoose');

const LecturerSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true
    },
    provider: {
        type: String,
        default: 'local'
    },
    role: {
        type: String,
        default: 'lecturer'
    },
    gender: {
        type: String,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now()
    },
    avatar: {
        type: String,
        default: 'https://i.ibb.co/NnbNMtSw/default-avatar.png'
    },
    description: {
        type: String,
        default: 'Đây là miêu tả giáo viên'
    },
    isAuth: {
        type: Boolean,
        default: false
    },
    otpNumber: {
        type: String
    },
    status: {
        type: Boolean,
        default: true,
    },
    idCourses: {
        type: [mongoose.Schema.ObjectId],
        ref: 'courses'
    }
});

const Lecturer = mongoose.models.lecturers || mongoose.model('lecturers', LecturerSchema);

module.exports = Lecturer;
