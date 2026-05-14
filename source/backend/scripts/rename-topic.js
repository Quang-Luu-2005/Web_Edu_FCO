require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose   = require('mongoose');
const CourseTopic = require('../admin/models/CourseTopic.model');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const r = await CourseTopic.updateOne(
      { name: 'Khóa học theo giờ tôi' },
      { $set: { name: 'Khóa học theo giờ' } }
    );
    console.log('Updated:', r.nModified || r.modifiedCount);
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
