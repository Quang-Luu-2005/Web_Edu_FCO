require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose  = require('mongoose');
const LocalUser = require('../models/LocalUser.model');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const users = await LocalUser.find({}, 'name email role username');
    console.log('Users:', JSON.stringify(users, null, 2));
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
