const session = require("express-session");

module.exports = function (app) {
    // Express session
    app.use(session({
        secret: process.env.SESSION_SECRET || 'secret',
        resave: true,
        saveUninitialized: true,
    }));
};