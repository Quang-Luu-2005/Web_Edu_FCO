const TWO_MILLION = 2000000;

// Mức rank trong game (sắp xếp tăng dần)
const RANK_LEVELS = [
  { value: 'ban-chuyen',    label: 'Bán chuyên',    order: 1 },
  { value: 'chuyen-nghiep', label: 'Chuyên nghiệp', order: 2 },
  { value: 'the-gioi',      label: 'Thế giới',      order: 3 },
  { value: 'tinh-anh',      label: 'Tinh anh',      order: 4 },
  { value: 'huyen-thoai',   label: 'Huyền thoại',   order: 5 },
  { value: 'thach-dau',     label: 'Thách đấu',     order: 6 },
  { value: 'sieu-sao',      label: 'Siêu sao',      order: 7 }
];

const RANK_VALUES = RANK_LEVELS.map(r => r.value);

function getRankLabel(value) {
  const r = RANK_LEVELS.find(x => x.value === value);
  return r ? r.label : '';
}

function isProfileCompleteForPractice(user) {
  if (!user) return false;
  return !!(user.zaloPhone && user.zaloPhone.trim() &&
            user.inGameName && user.inGameName.trim() &&
            user.rank && RANK_VALUES.includes(user.rank));
}

async function getUser2MCourses(user) {
  if (!user || !Array.isArray(user.purchasedCourses) || user.purchasedCourses.length === 0) {
    return [];
  }
  const Course = require('../models/Course.model');
  const courseIds = user.purchasedCourses
    .map(p => p.idCourse)
    .filter(Boolean);
  if (courseIds.length === 0) return [];

  const courses = await Course.find(
    { _id: { $in: courseIds }, tuition: TWO_MILLION },
    'name tuition poster'
  );
  return courses;
}

async function is2MStudent(user) {
  const courses = await getUser2MCourses(user);
  return courses.length > 0;
}

module.exports = {
  TWO_MILLION,
  RANK_LEVELS,
  RANK_VALUES,
  getRankLabel,
  isProfileCompleteForPractice,
  getUser2MCourses,
  is2MStudent
};
