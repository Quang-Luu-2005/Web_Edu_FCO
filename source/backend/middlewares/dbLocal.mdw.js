const mongoose = require('mongoose');

let listenersRegistered = false;

function registerModels() {
    // Register models before connecting so populate() can resolve schemas.
    require('../models/LocalUser.model');
    require('../models/Lecturer.model');
    require('../admin/models/Admin.model');
    require('../models/Course.model');
    require('../models/CourseClass.model');
    require('../models/SupportTicket.model');
}

module.exports = function(app, runtimeOptions = {}) {
    const uri = require('../config/key.config').MongoLocal;
    const shouldConnectDb = runtimeOptions.connectDb !== false && process.env.NODE_ENV !== 'test';
    let retryTimer = null;
    let isConnecting = false;

    registerModels();
    mongoose.set('useCreateIndex', true);

    if (!shouldConnectDb) {
        return;
    }

    const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        useCreateIndex: true,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    };

    const scheduleReconnect = () => {
        if (retryTimer || isConnecting || mongoose.connection.readyState === 1) return;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            connect();
        }, 5000);
    };

    const connect = async () => {
        if (!uri) {
            console.error('[DB] Missing MONGO_URI. Database features will not work.');
            return;
        }

        if (isConnecting || mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
            return;
        }

        isConnecting = true;
        try {
            await mongoose.connect(uri, options);
        } catch (err) {
            console.error('[DB] Connection error:', err.message);
            scheduleReconnect();
        } finally {
            isConnecting = false;
        }
    };

    if (!listenersRegistered) {
        mongoose.connection.on('connected', () => {
            console.log('[DB] MongoDB connected');
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('[DB] MongoDB disconnected - retrying...');
            scheduleReconnect();
        });

        mongoose.connection.on('error', err => {
            console.error('[DB] MongoDB error:', err.message);
        });

        listenersRegistered = true;
    }

    connect();
};
