const index    = require('../routers/index.route');
const users    = require('../routers/users.route');
const course   = require('../routers/course.route');
const payment  = require('../routers/payment.route');
const courses  = require('../routers/courses.route');
const classes  = require('../routers/classes.route');
const practice = require('../routers/practice.route');
const admin    = require('../admin/routers/admin');
const adminPractice = require('../admin/routers/practice');

module.exports = function(app) {
    app.use('/', index);
    app.use('/users', users);
    app.use('/course', course);
    app.use('/payment', payment);
    app.use('/courses', courses);
    app.use('/classes', classes);
    app.use('/practice', practice);
    app.use('/admin/practice', (req, res, next) => {
        res.locals.layout = false;
        next();
    }, adminPractice);
    app.use('/admin', (req, res, next) => {
        res.locals.layout = false;
        next();
    }, admin);
}
