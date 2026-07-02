const mongoose = require('mongoose');
const CourseClass = require('../../models/CourseClass.model');
const {
  assignStudentToOpenClass,
  calculateClassStatus,
  getClassProgress,
  getEnrollmentSlotSummary,
  syncAndSaveClassStatus,
} = require('../../services/courseClassStatus.service');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('../setup/testDb');
const Course = require('../../models/Course.model');
const LocalUser = require('../../models/LocalUser.model');

describe('courseClassStatus.service', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('calculateClassStatus returns ongoing then completed based on done sessions', () => {
    const cls = {
      status: 'open',
      idCourse: { totalSessions: 3 },
      sessions: [
        { status: 'done' },
        { status: 'done' },
        { status: 'scheduled' },
      ]
    };

    expect(calculateClassStatus(cls, cls.idCourse)).toBe('ongoing');
    expect(getClassProgress(cls, cls.idCourse)).toMatchObject({ required: 3, done: 2, progress: 67, isCompleted: false });

    cls.sessions[2].status = 'done';
    expect(calculateClassStatus(cls, cls.idCourse)).toBe('completed');
    expect(getClassProgress(cls, cls.idCourse)).toMatchObject({ required: 3, done: 3, progress: 100, isCompleted: true });
  });

  test('cancelled class keeps cancelled status', () => {
    const cls = {
      status: 'cancelled',
      idCourse: { totalSessions: 3 },
      sessions: [{ status: 'done' }, { status: 'done' }, { status: 'done' }]
    };

    expect(calculateClassStatus(cls, cls.idCourse)).toBe('cancelled');
  });

  test('syncAndSaveClassStatus recalculates status after deleting a done session', async () => {
    const courseId = new mongoose.Types.ObjectId();
    const lecturerId = new mongoose.Types.ObjectId();
    const cls = await CourseClass.create({
      idCourse: courseId,
      idLecturer: lecturerId,
      name: 'Class Sync',
      status: 'completed',
      sessions: [
        { title: 'Buổi 1', status: 'done' },
        { title: 'Buổi 2', status: 'done' },
        { title: 'Buổi 3', status: 'done' },
      ]
    });

    cls.sessions.pull({ _id: cls.sessions[2]._id });
    const progress = await syncAndSaveClassStatus(cls, { totalSessions: 3 });

    expect(progress.status).toBe('ongoing');
    expect(progress.done).toBe(2);
    expect(progress.required).toBe(3);

    const saved = await CourseClass.findById(cls._id).lean();
    expect(saved.status).toBe('ongoing');
  });

  test('getEnrollmentSlotSummary counts completed, active and pending slots correctly', async () => {
    const userId = new mongoose.Types.ObjectId();
    const lecturerId = new mongoose.Types.ObjectId();
    const courseId = new mongoose.Types.ObjectId();
    const user = { _id: userId, purchasedCourses: [{ idCourse: courseId }, { idCourse: courseId }] };

    await CourseClass.create({
      idCourse: courseId,
      idLecturer: lecturerId,
      name: 'Completed class',
      status: 'completed',
      students: [{ idUser: userId }],
      sessions: [{ status: 'done' }, { status: 'done' }, { status: 'done' }],
    });
    await CourseClass.create({
      idCourse: courseId,
      idLecturer: lecturerId,
      name: 'Open class',
      status: 'open',
      students: [{ idUser: userId }],
      sessions: [{ status: 'scheduled' }, { status: 'scheduled' }, { status: 'scheduled' }],
    });

    const summary = await getEnrollmentSlotSummary(user, courseId, { course: { totalSessions: 3 } });
    expect(summary.purchaseCount).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.active).toBe(1);
    expect(summary.pendingClassSlots).toBe(0);
  });

  test('assignStudentToOpenClass auto-assigns only to open class with available slot', async () => {
    const lecturerId = new mongoose.Types.ObjectId();
    const course = await Course.create({
      name: 'Auto Assign Course',
      courseType: 'session',
      totalSessions: 3,
    });
    const user = await LocalUser.create({
      username: 'student-auto',
      email: 'student-auto@example.com',
      password: 'hashed',
      name: 'Student Auto',
      purchasedCourses: [{ idCourse: course._id }],
      isAuth: true,
    });

    await CourseClass.create({
      idCourse: course._id,
      idLecturer: lecturerId,
      name: 'Ongoing class',
      status: 'ongoing',
      maxStudents: 10,
      sessions: [{ status: 'done' }, { status: 'scheduled' }, { status: 'scheduled' }],
      students: [],
    });
    const openClass = await CourseClass.create({
      idCourse: course._id,
      idLecturer: lecturerId,
      name: 'Open class',
      status: 'open',
      maxStudents: 10,
      sessions: [{ status: 'scheduled' }, { status: 'scheduled' }, { status: 'scheduled' }],
      students: [],
    });

    const assigned = await assignStudentToOpenClass(user, course);
    expect(assigned).toBeTruthy();
    expect(assigned._id.toString()).toBe(openClass._id.toString());

    const saved = await CourseClass.findById(openClass._id).lean();
    expect(saved.students).toHaveLength(1);
    expect(saved.students[0].idUser.toString()).toBe(user._id.toString());
  });
});
