const session = require('express-session');
const MongoDBStoreFactory = require('connect-mongodb-session');

module.exports = function(app) {
    const uri = require('../config/key.config').MongoLocal;
    const MongoDBStore = MongoDBStoreFactory(session);

    let store;
    if (uri) {
        store = new MongoDBStore({
            uri,
            collection: 'sessions',
            expires: 1000 * 60 * 60 * 24 * 7,
            connectionOptions: {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 10000,
            },
        });

        store.on('error', err => {
            console.error('[Session] Mongo store error:', err.message);
        });
    } else {
        console.warn('[Session] Missing MONGO_URI, falling back to MemoryStore.');
    }

    app.set('trust proxy', 1);
    app.use(session({
        secret: process.env.SESSION_SECRET || 'secret',
        store,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 7,
        },
    }));
};
