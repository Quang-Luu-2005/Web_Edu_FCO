const mongoose = require('mongoose');

const TopWeekSchema = mongoose.Schema({
    name: {
        type: String,
        default: ''
    },
    nameTopCourses: {
        type: [String],
        default: []
    },
    idTopCourses: {
        type: [mongoose.Schema.ObjectId],
        ref: 'courses',
        default: []
    },
    nameTopCategories: {
        type: [String],
        default: []
    },
    idTopCategories: {
        type: [mongoose.Schema.ObjectId],
        ref: 'coursetopics',
        default: []
    }
});

const TopWeek = mongoose.models.topweeks || mongoose.model('topweeks', TopWeekSchema);

module.exports = TopWeek;
