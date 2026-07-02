const express = require("express");

const Router = express.Router();

const Course = require("../models/Course.model");

const CourseTopic = require("../models/CourseTopic.model");

const { readHomeBanners } = require("../config/home-banner.config");

const {
  ensureAuthenticated,
  forwardAuthenticated,
} = require("../config/auth.config");
const {
  getClassProgress,
  getEnrollmentSlotSummary,
  syncAndSaveClassesStatus,
} = require('../services/courseClassStatus.service');

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

  const myClasses = await CourseClass.find({
    'students.idUser': req.user._id
  })
    .populate('idCourse', 'name totalSessions')
    .sort({ createdAt: -1 });
  await syncAndSaveClassesStatus(myClasses);

  const classByCourseId = {};
  myClasses.forEach((cls) => {
    if (!cls.idCourse) return;
    const key = cls.idCourse._id ? cls.idCourse._id.toString() : cls.idCourse.toString();
    const current = classByCourseId[key];
    if (!current || (current.status !== 'completed' && cls.status === 'completed')) {
      classByCourseId[key] = cls;
    }
  });

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
    const progressMeta = myClass ? getClassProgress(myClass, course) : null;
    const summary = await getEnrollmentSlotSummary(req.user, course._id, { course, classes: myClasses });
    const canPurchaseAgain = course.courseType === 'hour'
      || (summary.active === 0 && summary.completed >= (pc.purchaseCount || 1));

    items.push({
      course,
      learnedCount: progressMeta ? progressMeta.done : 0,
      totalVideos: progressMeta ? progressMeta.required : (course.totalSessions || 0),
      progress: progressMeta ? progressMeta.progress : 0,
      isDone: progressMeta ? progressMeta.isCompleted : false,
      classId: myClass ? myClass._id.toString() : null,
      className: myClass ? myClass.name : null,
      classStatus: progressMeta ? progressMeta.status : null,
      enrolledAt: pc.enrolledAt || null,
      lastLearnedAt: pc.lastLearnedAt || null,
      purchaseCount: pc.purchaseCount || 1,
      totalPurchasedHours: pc.totalPurchasedHours || 0,
      canPurchaseAgain,
      pendingClassSlots: summary.pendingClassSlots,
    });
  }

  await res.render("./courses/my-courses", {
    isAuthenticated: req.isAuthenticated(),
    items,
    user: req.user
  });
});

module.exports = Router;
