const cloudinary = require('cloudinary').v2;

module.exports = function () {
    if (process.env.NODE_ENV === 'test') {
        return;
    }

    require('../config/cloudinary.config')(cloudinary);
}
