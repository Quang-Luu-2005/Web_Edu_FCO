const mongoose = require('mongoose');

const CategoryEnum = require('./CourseCategory.enum');

const CourseCategorySchema = mongoose.Schema({
    name: {
        type: String,
        enum: Object.values(CategoryEnum),
        required: true,
        unique: true
    },
    numberOfView: {
        type: Number,
        default : 0
    },
    image : {
        type: String,
        default: 'https://i.ibb.co/NnbNMtSw/default-avatar.png'
    },
    numberOfSignUp: {
        type: Number,
        default: 0
    },
    parent: {
        type: String,
        default: ""
    }
});

const CourseCategory = mongoose.models.coursecategories || mongoose.model('coursecategories', CourseCategorySchema);

module.exports = CourseCategory;
