const expressLayouts = require('express-ejs-layouts');

const ejs = require('ejs');
const path = require('path');

module.exports = function(app) {
    app.set('views', [
        path.join(__dirname, '../views'),
        path.join(__dirname, '../admin/views')
    ]);
    app.set('view engine', 'ejs');
    app.use(expressLayouts);
}
