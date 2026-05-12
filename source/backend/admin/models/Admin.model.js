const mongoose = require('mongoose');

const AdminSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        default: 'admin'
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
        default: 'admin'
    },
    gender: {
        type: String,
    },
    date_added: {
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
    roll: {
        type: String,
        default: false
    },
    status: {
        type: Boolean,
        default: true
    },
});

const Lecturer = mongoose.models.admins || mongoose.model('admins', AdminSchema);

module.exports = Lecturer;
