/**
 * Admin model — alias của LocalUser với role='admin'
 * Giữ file này để tương thích ngược với các import cũ còn sót.
 */
const LocalUser = require('../../models/LocalUser.model');
module.exports = LocalUser;
