const mongoose = require('mongoose');

const TopicEnum = require('./CourseTopic.enum');

const CourseTopicSchema = mongoose.Schema({
    name: {
        type: TopicEnum,
        required: true,
        unique: true
    },
    image: {
        type: String,
        default: 'https://i.ibb.co/NnbNMtSw/default-avatar.png'
    },
    numberOfView: {
        type: Number,
        default: 0
    },
    numberOfSignUp: {
        type: Number,
        default: 0
    },
    idCourseCategory: {
        type: mongoose.Schema.ObjectId,
        ref: 'coursecategories'
    }
});

const CourseTopic = mongoose.models.coursetopics || mongoose.model('coursetopics', CourseTopicSchema);

module.exports = CourseTopic;
