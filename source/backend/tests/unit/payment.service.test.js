const mongoose = require('mongoose');
const Course = require('../../models/Course.model');
const CourseCategory = require('../../models/CourseCategory.model');
const CourseTopic = require('../../models/CourseTopic.model');
const LocalUser = require('../../models/LocalUser.model');
const PaymentOrder = require('../../models/PaymentOrder.model');
const CourseClass = require('../../models/CourseClass.model');
const {
  buildPaymentAmount,
  canPurchaseCourse,
  completePaidOrder,
  getPaymentDescription,
  getValidDiscount,
  isDiscountExpired,
  markOrderCancelled,
  normalizeOrderCode,
} = require('../../services/payment.service');
const { getEnrollmentSlotSummary } = require('../../services/courseClassStatus.service');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('../setup/testDb');

describe('payment.service', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('normalizeOrderCode validates positive safe integers', () => {
    expect(normalizeOrderCode('123')).toBe(123);
    expect(normalizeOrderCode('0')).toBeNull();
    expect(normalizeOrderCode('abc')).toBeNull();
  });

  test('getPaymentDescription trims and shortens text', () => {
    expect(getPaymentDescription({ name: '  Khoa hoc sieu cap danh cho hoc vien moi  ' }).length).toBeLessThanOrEqual(25);
  });

  test('isDiscountExpired handles null, invalid and expired dates', () => {
    expect(isDiscountExpired(null)).toBe(false);
    expect(isDiscountExpired('invalid')).toBe(true);
    expect(isDiscountExpired(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))).toBe(true);
  });

  test('getValidDiscount and buildPaymentAmount apply only active usable coupon', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const course = {
      tuition: 1000000,
      discountCodes: [
        { code: 'BAD', percent: 20, active: false, maxUses: 0, usedCount: 0, expiresAt: future },
        { code: 'SALE50', percent: 50, active: true, maxUses: 1, usedCount: 0, expiresAt: future },
      ],
    };

    expect(getValidDiscount(course, 'bad')).toBeNull();
    expect(getValidDiscount(course, 'sale50').code).toBe('SALE50');
    expect(buildPaymentAmount(course, 'sale50')).toEqual({
      originalAmount: 1000000,
      amount: 500000,
      discountCode: 'SALE50',
      discountPercent: 50,
    });
  });

  test('buildPaymentAmount clamps discount percent to zero and one hundred', () => {
    const high = buildPaymentAmount({ tuition: 1000, discountCodes: [{ code: 'MAX', percent: 999, active: true, maxUses: 0, usedCount: 0 }] }, 'MAX');
    const low = buildPaymentAmount({ tuition: 1000, discountCodes: [{ code: 'MIN', percent: -5, active: true, maxUses: 0, usedCount: 0 }] }, 'MIN');
    expect(high.amount).toBe(0);
    expect(low.amount).toBe(1000);
  });

  test('canPurchaseCourse allows first purchase, blocks active class, allows repurchase after completed classes', async () => {
    const userId = new mongoose.Types.ObjectId();
    const courseId = new mongoose.Types.ObjectId();
    const lecturerId = new mongoose.Types.ObjectId();
    const user = {
      _id: userId,
      purchasedCourses: [],
    };
    const course = { _id: courseId, courseType: 'session', totalSessions: 3 };

    expect(await canPurchaseCourse(user, course)).toBe(true);

    user.purchasedCourses = [{ idCourse: courseId }];
    await CourseClass.create({
      idCourse: courseId,
      idLecturer: lecturerId,
      name: 'Class A',
      status: 'ongoing',
      students: [{ idUser: userId, attendance: [] }],
      sessions: [{ status: 'done' }, { status: 'scheduled' }, { status: 'scheduled' }],
    });

    expect(await canPurchaseCourse(user, course)).toBe(false);

    await clearTestDb();
    await CourseClass.create({
      idCourse: courseId,
      idLecturer: lecturerId,
      name: 'Class B',
      status: 'open',
      students: [{ idUser: userId, attendance: [] }],
      sessions: [{ status: 'done' }, { status: 'done' }, { status: 'done' }],
    });

    expect(await canPurchaseCourse(user, course)).toBe(true);
    const summary = await getEnrollmentSlotSummary(user, courseId, { course });
    expect(summary.completed).toBe(1);
    expect(summary.active).toBe(0);
    expect(await canPurchaseCourse(user, { _id: courseId, courseType: 'hour' })).toBe(true);
  });

  test('completePaidOrder auto-assigns session purchase to an open class when available', async () => {
    const lecturerId = new mongoose.Types.ObjectId();
    const user = await LocalUser.create({
      username: 'student-session',
      email: 'student-session@example.com',
      password: 'hashed',
      name: 'Student Session',
      isAuth: true,
    });
    const course = await Course.create({
      name: 'Session Course Payment Test',
      tuition: 0,
      courseType: 'session',
      totalSessions: 3,
    });
    const openClass = await CourseClass.create({
      idCourse: course._id,
      idLecturer: lecturerId,
      name: 'Open Session Class',
      status: 'open',
      maxStudents: 10,
      sessions: [{ status: 'scheduled' }, { status: 'scheduled' }, { status: 'scheduled' }],
      students: [],
    });
    await PaymentOrder.create({
      orderCode: 456789,
      provider: 'free',
      idUser: user._id,
      idCourse: course._id,
      courseName: course.name,
      courseType: 'session',
      originalAmount: 0,
      amount: 0,
    });

    const result = await completePaidOrder(456789, { source: 'test' });

    expect(result.completed).toBe(true);
    expect(result.assignedClass._id.toString()).toBe(openClass._id.toString());

    const assignedClass = await CourseClass.findById(openClass._id).lean();
    expect(assignedClass.students).toHaveLength(1);
    expect(assignedClass.students[0].idUser.toString()).toBe(user._id.toString());
  });

  test('completePaidOrder leaves session purchase unassigned when no open class is available', async () => {
    const lecturerId = new mongoose.Types.ObjectId();
    const user = await LocalUser.create({
      username: 'student-waiting',
      email: 'student-waiting@example.com',
      password: 'hashed',
      name: 'Student Waiting',
      isAuth: true,
    });
    const course = await Course.create({
      name: 'Waiting Session Course',
      tuition: 0,
      courseType: 'session',
      totalSessions: 3,
    });
    await CourseClass.create({
      idCourse: course._id,
      idLecturer: lecturerId,
      name: 'Completed Session Class',
      status: 'completed',
      maxStudents: 10,
      sessions: [{ status: 'done' }, { status: 'done' }, { status: 'done' }],
      students: [],
    });
    await PaymentOrder.create({
      orderCode: 456790,
      provider: 'free',
      idUser: user._id,
      idCourse: course._id,
      courseName: course.name,
      courseType: 'session',
      originalAmount: 0,
      amount: 0,
    });

    const result = await completePaidOrder(456790, { source: 'test' });

    expect(result.completed).toBe(true);
    expect(result.assignedClass).toBeNull();

    const assignedCount = await CourseClass.countDocuments({ 'students.idUser': user._id });
    expect(assignedCount).toBe(0);
  });

  test('completePaidOrder enrolls user, updates counters and stays idempotent', async () => {
    const category = await CourseCategory.create({ name: 'Design', numberOfSignUp: 0 });
    const topic = await CourseTopic.create({ name: 'Design Tools', idCourseCategory: category._id, numberOfSignUp: 0 });
    const user = await LocalUser.create({
      username: 'student1',
      email: 'student1@example.com',
      password: 'hashed',
      name: 'Student 1',
      isAuth: true,
    });
    const course = await Course.create({
      name: 'Course Payment Test',
      tuition: 200000,
      courseType: 'hour',
      totalHours: 12,
      idCourseTopic: topic._id,
      discountCodes: [{ code: 'FREE100', percent: 100, maxUses: 10, usedCount: 0, active: true }],
    });
    await PaymentOrder.create({
      orderCode: 123456,
      provider: 'free',
      idUser: user._id,
      idCourse: course._id,
      courseName: course.name,
      courseType: 'hour',
      hoursPurchased: 12,
      originalAmount: 200000,
      amount: 0,
      discountCode: 'FREE100',
      discountPercent: 100,
    });

    const first = await completePaidOrder(123456, { source: 'test' });
    expect(first.completed).toBe(true);

    const updatedUser = await LocalUser.findById(user._id).lean();
    const updatedCourse = await Course.findById(course._id).lean();
    const updatedTopic = await CourseTopic.findById(topic._id).lean();
    const updatedCategory = await CourseCategory.findById(category._id).lean();
    const updatedOrder = await PaymentOrder.findOne({ orderCode: 123456 }).lean();

    expect(updatedUser.purchasedCourses).toHaveLength(1);
    expect(updatedUser.idCourses).toHaveLength(1);
    expect(updatedCourse.numberOfStudent).toBe(1);
    expect(updatedTopic.numberOfSignUp).toBe(1);
    expect(updatedCategory.numberOfSignUp).toBe(1);
    expect(updatedOrder.status).toBe('paid');

    const second = await completePaidOrder(123456, { source: 'second-run' });
    const secondUser = await LocalUser.findById(user._id).lean();
    const secondCourse = await Course.findById(course._id).lean();
    expect(second.completed).toBe(false);
    expect(secondUser.purchasedCourses).toHaveLength(1);
    expect(secondCourse.numberOfStudent).toBe(1);
  });

  test('markOrderCancelled marks only matching pending user order and calls cancelPayment', async () => {
    const userId = new mongoose.Types.ObjectId();
    const courseId = new mongoose.Types.ObjectId();
    await PaymentOrder.create({
      orderCode: 777,
      provider: 'payos',
      idUser: userId,
      idCourse: courseId,
      courseName: 'Pending order',
      amount: 1000,
    });

    const cancelPayment = jest.fn().mockResolvedValue(true);
    const order = await markOrderCancelled({ orderCode: 777, userId, cancelPayment });

    expect(cancelPayment).toHaveBeenCalledWith(777);
    expect(order.status).toBe('cancelled');
  });
});
