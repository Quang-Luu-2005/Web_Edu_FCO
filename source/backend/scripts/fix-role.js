require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose  = require('mongoose');
const LocalUser = require('../models/LocalUser.model');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const result = await LocalUser.findByIdAndUpdate(
      '6a05d2e5a42f255ff01d2ea0',
      { $set: { role: 'user' } },
      { new: true }
    );
    console.log('Updated:', result ? result.role : 'NOT FOUND');
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
