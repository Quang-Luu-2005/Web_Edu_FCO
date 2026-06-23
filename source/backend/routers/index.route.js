const express = require("express");

const Router = express.Router();

const Course = require("../models/Course.model");

const CourseTopic = require("../models/CourseTopic.model");

const { readHomeBanners } = require("../config/home-banner.config");

const {
  ensureAuthenticated,
  forwardAuthenticated,
} = require("../config/auth.config");

const safeArray = (value) => Array.isArray(value) ? value : [];

//Trang chủ
Router.get("/", async (req, res) => {
  //3 khóa học được quan tâm nhất(dựa trên điểm đánh giá), view trên tb
  const proCourses = await Course.find({})
    .sort([["evaluationPoint", -1]])
    .populate("idLecturer")
    .populate("idCourseTopic")
    .limit(3);

  //10 khóa học được xem nhiều nhất
  const mostViewCourses = await Course.find({})
    .sort([["numberOfView", -1]])
    .populate("idLecturer")
    .populate("idCourseTopic")
    .limit(10);

  //10 khóa học mới nhất
  const latestCourses = await Course.find({})
    .sort([["uploadDate", -1]])
    .populate("idLecturer")
    .populate("idCourseTopic")
    .limit(10);

  const fallbackBanners = [
    proCourses[0] && proCourses[0].poster,
    proCourses[1] && proCourses[1].poster,
    latestCourses[1] && latestCourses[1].poster
  ];
  const homeBanners = readHomeBanners().map((banner, index) => {
    return banner || fallbackBanners[index] || "/public/logo.png";
  });

  await res.render("./index/home", {
    isAuthenticated: req.isAuthenticated(),
    proCourses: proCourses,
    mostViewCourses: mostViewCourses,
    latestCourses: latestCourses,
    homeBanners: homeBanners,
    user: req.user
  });
});

//Trang danh sách khóa học yêu thích của tôi
Router.get("/my-wish-list", ensureAuthenticated, async (req, res) => {
  let page = +req.query.page;

  //Nếu page == undefined thi page = 1
  if (Number.isNaN(page)) {
    page = 1;
  }

  //Lấy ra danh sách khóa học
  const wishList = safeArray(req.user.idWishList);
  let courses = [];
  let numberOfPage = 0;
  for (let i = 0; i < wishList.length; i++) {
    const course = await Course.findOne(
      {
        _id: wishList[i],
      },
      [
        "poster",
        "_id",
        "name",
        "idLecturer",
        "evaluationPoint",
        "userEvaluations",
        "tuition",
        "numberOfStudent",
        "idCourseTopic",
        "numberOfView",
      ]
    )
      .populate("idCourseTopic")
      .populate("idLecturer");
    if (course) {
      await courses.push(course);
    }
  }
  numberOfPage = Math.ceil(courses.length / 5);

  //Lấy ra đúng 5 khóa học
  courses = courses.slice((page-1) * 5, (page - 1) * 5 + 5);

  await res.render("./courses/list-courses", {
    isAuthenticated: req.isAuthenticated(),
    courses: courses,
    title: `Các khóa học yêu thích`,
    page: page,
    isFilter: false,
    numberOfPage: numberOfPage,
    user: req.user
  });
});

//Trang danh sách khóa học của tôi
Router.get("/my-courses", ensureAuthenticated, async (req, res) => {
  const purchasedCourses = safeArray(req.user.purchasedCourses);
  const CourseClass = require('../models/CourseClass.model');

  // Lấy tất cả lớp mà user là thành viên
  const myClasses = await CourseClass.find({
    'students.idUser': req.user._id
  }).select('idCourse name sessions status createdAt')
    .sort({ createdAt: -1 });

  // Map từ courseId → class user thuộc về
  const classByCourseId = {};
  myClasses.forEach(cls => {
    if (!cls.idCourse) return;
    const key = cls.idCourse.toString();
    if (!classByCourseId[key] || classByCourseId[key].status === 'completed') {
      classByCourseId[key] = cls;
    }
  });

  // Build danh sách kèm meta
  const purchaseGroups = new Map();
  for (const pc of purchasedCourses) {
    if (!pc.idCourse) continue;
    const key = pc.idCourse.toString();
    const current = purchaseGroups.get(key) || {
      idCourse: pc.idCourse,
      purchaseCount: 0,
      totalPurchasedHours: 0,
      enrolledAt: pc.enrolledAt || null,
      lastLearnedAt: pc.lastLearnedAt || null,
      learnedVideos: safeArray(pc.learnedVideos)
    };

    current.purchaseCount += 1;
    current.totalPurchasedHours += Number(pc.hoursPurchased) || 0;
    if (pc.enrolledAt && (!current.enrolledAt || new Date(pc.enrolledAt) > new Date(current.enrolledAt))) {
      current.enrolledAt = pc.enrolledAt;
    }
    if (pc.lastLearnedAt && (!current.lastLearnedAt || new Date(pc.lastLearnedAt) > new Date(current.lastLearnedAt))) {
      current.lastLearnedAt = pc.lastLearnedAt;
    }
    purchaseGroups.set(key, current);
  }

  const items = [];
  for (const pc of purchaseGroups.values()) {
    const course = await Course.findOne({ _id: pc.idCourse })
      .populate("idLecturer")
      .populate("idCourseTopic");
    if (!course) continue;

    const myClass = classByCourseId[course._id.toString()];
    const userClassesForCourse = myClasses.filter(cls => cls.idCourse && cls.idCourse.toString() === course._id.toString());
    const activeClass = userClassesForCourse.some(cls => !['completed', 'cancelled'].includes(cls.status));
    const completedClassCount = userClassesForCourse.filter(cls => cls.status === 'completed').length;
    const canPurchaseAgain = course.courseType === 'hour'
      || (!activeClass && completedClassCount >= (pc.purchaseCount || 1));

    // Tổng buổi: ưu tiên course.totalSessions, fallback theo sessions của lớp
    const totalSessions = course.totalSessions
      || (myClass ? myClass.sessions.length : 0)
      || 0;

    // Số buổi đã hoàn thành (status === 'done') trong lớp của user
    const learnedCount = myClass
      ? myClass.sessions.filter(s => s.status === 'done').length
      : 0;

    const progress = totalSessions > 0 ? Math.round((learnedCount / totalSessions) * 100) : 0;
    const isDone   = totalSessions > 0 && learnedCount >= totalSessions;

    // Auto chuyển trạng thái lớp khi đủ số buổi
    if (myClass) {
      const newStatus = isDone ? 'completed' : (learnedCount > 0 ? 'ongoing' : 'open');
      if (myClass.status !== newStatus) {
        await CourseClass.updateOne({ _id: myClass._id }, { $set: { status: newStatus } });
        myClass.status = newStatus;
      }
    }

    items.push({
      course,
      learnedCount,
      totalVideos:    totalSessions,
      progress,
      isDone,
      classId:        myClass ? myClass._id.toString() : null,
      className:      myClass ? myClass.name : null,
      enrolledAt:     pc.enrolledAt    || null,
      lastLearnedAt:  pc.lastLearnedAt || null,
      purchaseCount:  pc.purchaseCount || 1,
      totalPurchasedHours: pc.totalPurchasedHours || 0,
      canPurchaseAgain,
    });
  }

  await res.render("./courses/my-courses", {
    isAuthenticated: req.isAuthenticated(),
    items,
    user: req.user
  });
});

module.exports = Router;
