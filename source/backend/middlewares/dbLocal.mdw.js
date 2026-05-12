const mongoose = require('mongoose');

module.exports = function(app) {
    const uri = require('../config/key.config').MongoLocal;

    // Đảm bảo tất cả models được register trước khi connect
    // để populate() không bị MissingSchemaError
    require('../models/LocalUser.model');
    require('../models/Lecturer.model');   // register collection 'lecturers' cho Course.populate
    require('../admin/models/Admin.model');
    require('../models/Course.model');

    const options = {
        useNewUrlParser:    true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    };

    const connect = () => {
        mongoose.connect(uri, options)
            .then(() => console.log('[DB] MongoDB connected'))
            .catch(err => {
                console.error('[DB] Connection error:', err.message);
                setTimeout(connect, 5000);
            });
    };

    connect();

    mongoose.connection.on('disconnected', () => {
        console.warn('[DB] MongoDB disconnected — retrying...');
        setTimeout(connect, 5000);
    });

    mongoose.connection.on('error', err => {
        console.error('[DB] MongoDB error:', err.message);
    });
};
