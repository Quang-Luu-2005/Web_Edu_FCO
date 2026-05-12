/**
 * Lecturer model — alias của LocalUser với role='lecturer'
 * Giữ file này để tương thích với Course.model ref: 'lecturers'
 * và các populate('.idLecturer') hiện có.
 *
 * Sau khi migrate data từ collection 'lecturers' sang 'localusers',
 * cần đổi Course.model ref thành 'localusers' và xóa file này.
 */
const LocalUser = require('../../models/LocalUser.model');
module.exports = LocalUser;
