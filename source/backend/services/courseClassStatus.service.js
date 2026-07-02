const CourseClass = require('../models/CourseClass.model');

const CLASS_STATUS = {
  OPEN: 'open',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const safeArray = (value) => Array.isArray(value) ? value : [];

function toIdString(value) {
  if (!value) return '';
  if (value._id) return value._id.toString();
  return value.toString();
}

function getRequiredSessionCount(cls, course = null) {
  const courseTotal = Number(course && course.totalSessions) || 0;
  if (courseTotal > 0) return courseTotal;

  const populatedCourseTotal = Number(cls && cls.idCourse && cls.idCourse.totalSessions) || 0;
  if (populatedCourseTotal > 0) return populatedCourseTotal;

  return safeArray(cls && cls.sessions).length;
}

function countDoneSessions(cls) {
  return safeArray(cls && cls.sessions).filter((session) => session.status === 'done').length;
}

function calculateClassStatus(cls, course = null) {
  const currentStatus = cls && cls.status;
  if (currentStatus === CLASS_STATUS.CANCELLED) {
    return CLASS_STATUS.CANCELLED;
  }

  const required = getRequiredSessionCount(cls, course);
  const done = countDoneSessions(cls);

  if (required > 0 && done >= required) {
    return CLASS_STATUS.COMPLETED;
  }

  if (done > 0) {
    return CLASS_STATUS.ONGOING;
  }

  // Giữ tương thích với các lớp cũ đã được admin đánh dấu hoàn thành thủ công
  // nhưng chưa cấu hình tổng số buổi học.
  if (required === 0 && currentStatus === CLASS_STATUS.COMPLETED) {
    return CLASS_STATUS.COMPLETED;
  }

  return CLASS_STATUS.OPEN;
}

function getClassProgress(cls, course = null) {
  const required = getRequiredSessionCount(cls, course);
  const done = countDoneSessions(cls);
  const status = calculateClassStatus(cls, course);
  const progress = required > 0 ? Math.min(100, Math.round((done / required) * 100)) : 0;

  return {
    required,
    done,
    remaining: Math.max(0, required - done),
    progress,
    status,
    isCompleted: status === CLASS_STATUS.COMPLETED
  };
}

function syncClassStatus(cls, course = null) {
  const previousStatus = cls && cls.status;
  const progress = getClassProgress(cls, course);

  if (cls && previousStatus !== progress.status) {
    cls.status = progress.status;
  }

  progress.previousStatus = previousStatus || CLASS_STATUS.OPEN;
  progress.changed = previousStatus !== progress.status;
  return progress;
}

async function syncAndSaveClassStatus(cls, course = null) {
  const progress = syncClassStatus(cls, course);
  if (progress.changed && cls && typeof cls.save === 'function') {
    await cls.save();
  }

  if (cls && cls.$locals) {
    cls.$locals.progressMeta = progress;
  }

  return progress;
}

async function syncAndSaveClassesStatus(classes, course = null) {
  const result = [];
  for (const cls of safeArray(classes)) {
    const progress = await syncAndSaveClassStatus(cls, course || (cls && cls.idCourse));
    result.push({ cls, progress });
  }
  return result;
}

function isActiveClassStatus(status) {
  return ![CLASS_STATUS.COMPLETED, CLASS_STATUS.CANCELLED].includes(status);
}

function getPurchaseCount(user, courseId) {
  const courseKey = toIdString(courseId);
  return safeArray(user && user.purchasedCourses)
    .filter((item) => item.idCourse && toIdString(item.idCourse) === courseKey)
    .length;
}

async function getStudentClassStats(userId, courseId, options = {}) {
  const userKey = toIdString(userId);
  const sourceClasses = options.classes || await CourseClass.find({
    idCourse: courseId,
    'students.idUser': userId
  }).populate('idCourse', 'totalSessions');

  const classes = safeArray(sourceClasses).filter((cls) => {
    return safeArray(cls && cls.students).some((student) => {
      return student.idUser && toIdString(student.idUser) === userKey;
    });
  });

  let completed = 0;
  let active = 0;
  let cancelled = 0;
  const progressByClassId = {};

  for (const cls of classes) {
    const progress = await syncAndSaveClassStatus(cls, options.course || (cls && cls.idCourse));
    progressByClassId[cls._id.toString()] = progress;

    if (progress.status === CLASS_STATUS.COMPLETED) completed += 1;
    else if (progress.status === CLASS_STATUS.CANCELLED) cancelled += 1;
    else if (isActiveClassStatus(progress.status)) active += 1;
  }

  return {
    completed,
    active,
    cancelled,
    total: classes.length,
    classes,
    progressByClassId
  };
}

async function getEnrollmentSlotSummary(user, courseId, options = {}) {
  const purchaseCount = getPurchaseCount(user, courseId);
  const stats = await getStudentClassStats(user && user._id, courseId, options);
  const pendingClassSlots = Math.max(0, purchaseCount - stats.completed - stats.active);

  return {
    purchaseCount,
    completed: stats.completed,
    active: stats.active,
    cancelled: stats.cancelled,
    pendingClassSlots,
    classes: stats.classes,
    progressByClassId: stats.progressByClassId
  };
}

async function getPendingClassSlots(user, courseId, options = {}) {
  const summary = await getEnrollmentSlotSummary(user, courseId, options);
  return summary.pendingClassSlots;
}

async function findAssignableOpenClass(course, userId) {
  if (!course || course.courseType === 'hour') return null;

  const classes = await CourseClass.find({
    idCourse: course._id,
    status: { $ne: CLASS_STATUS.CANCELLED }
  })
    .populate('idCourse', 'totalSessions')
    .sort({ createdAt: 1 });

  for (const cls of classes) {
    const progress = await syncAndSaveClassStatus(cls, course);
    if (progress.status !== CLASS_STATUS.OPEN) continue;

    const alreadyInClass = safeArray(cls.students).some((student) => {
      return student.idUser && toIdString(student.idUser) === toIdString(userId);
    });
    if (alreadyInClass) continue;

    const maxStudents = Number(cls.maxStudents) || 0;
    if (maxStudents > 0 && safeArray(cls.students).length >= maxStudents) continue;

    return cls;
  }

  return null;
}

async function assignStudentToOpenClass(user, course) {
  if (!user || !course || course.courseType === 'hour') return null;

  const pendingClassSlots = await getPendingClassSlots(user, course._id, { course });
  if (pendingClassSlots <= 0) return null;

  const cls = await findAssignableOpenClass(course, user._id);
  if (!cls) return null;

  cls.students.push({ idUser: user._id, enrolledAt: new Date(), attendance: [] });
  await cls.save();
  return cls;
}

module.exports = {
  CLASS_STATUS,
  assignStudentToOpenClass,
  calculateClassStatus,
  countDoneSessions,
  findAssignableOpenClass,
  getClassProgress,
  getEnrollmentSlotSummary,
  getPendingClassSlots,
  getPurchaseCount,
  getRequiredSessionCount,
  getStudentClassStats,
  isActiveClassStatus,
  syncAndSaveClassStatus,
  syncAndSaveClassesStatus,
  syncClassStatus,
};
