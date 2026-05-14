require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose   = require('mongoose');
const LocalUser  = require('../models/LocalUser.model');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const counts = await LocalUser.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    console.log('Role distribution:', JSON.stringify(counts));
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
