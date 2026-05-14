/**
 * Seed script: tạo category "Football Coaching" và 3 topics
 * Chạy: node scripts/seed-football-topics.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const CourseCategory = require('../admin/models/CourseCategory.model');
const CourseTopic    = require('../admin/models/CourseTopic.model');

async function seed() {
    await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    console.log('Connected to DB');

    // Tạo hoặc tìm category
    let cat = await CourseCategory.findOne({ name: 'Football Coaching' });
    if (!cat) {
        cat = await CourseCategory.create({ name: 'Football Coaching' });
        console.log('Created category: Football Coaching');
    } else {
        console.log('Category already exists:', cat._id);
    }

    const topics = [
        { name: 'Khóa học 2M',              idCourseCategory: cat._id },
        { name: 'Khóa học 1vs1',             idCourseCategory: cat._id },
        { name: 'Khóa học theo giờ tôi',     idCourseCategory: cat._id },
    ];

    for (const t of topics) {
        const exists = await CourseTopic.findOne({ name: t.name });
        if (!exists) {
            await CourseTopic.create(t);
            console.log('Created topic:', t.name);
        } else {
            console.log('Topic already exists:', t.name);
        }
    }

    console.log('Done!');
    process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
