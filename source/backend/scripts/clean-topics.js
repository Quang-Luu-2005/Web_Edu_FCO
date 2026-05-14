require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose    = require('mongoose');
const CourseTopic = require('../admin/models/CourseTopic.model');

const KEEP = ['Khóa học 2M', 'Khóa học 1vs1', 'Khóa học theo giờ'];

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const r = await CourseTopic.deleteMany({ name: { $nin: KEEP } });
    console.log('Deleted old topics:', r.deletedCount);
    const remaining = await CourseTopic.find({}, 'name');
    console.log('Remaining:', remaining.map(t => t.name));
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
