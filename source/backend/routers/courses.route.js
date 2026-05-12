const express = require("express");

const Router = express.Router();

const CourseTopic = require("../models/CourseTopic.model");

const Course = require("../models/Course.model");

const CourseCategory = require("../models/CourseCategory.model");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderNotFound = (res) => res.status(404).render("./error/404", {
  layout: false,
});

// Course list from user search
Router.get("/search", async (req, res) => {
  const queryString = (req.query.queryString || "").trim();
  const idCourseTopic = req.query.courseTopicID;
  let page = +req.query.page;

  if (Number.isNaN(page)) {
    page = 1;
  }

  const filter = {};
  if (queryString) {
    const pattern = new RegExp(escapeRegExp(queryString), "i");
    filter.$or = [
      { name: pattern },
      { description: pattern },
      { whatYoullLearn: pattern },
    ];
  }

  if (idCourseTopic) {
    filter.idCourseTopic = idCourseTopic;
  }

  const courses = await Course.find(filter)
    .populate("idLecturer")
    .populate("idCourseTopic");

  const courseCategories = await CourseCategory.find({});
  const numberOfPage = Math.ceil(courses.length / 5);
  const pagedCourses = courses.slice((page - 1) * 5, (page - 1) * 5 + 5);

  return res.render("./courses/list-courses", {
    isAuthenticated: req.isAuthenticated(),
    courses: pagedCourses,
    title: queryString ? `Kết quả tìm kiếm cho "${queryString}"` : "Tất cả khóa học",
    courseCategories: courseCategories,
    searchInput: queryString,
    page: page,
    isFilter: true,
    numberOfPage: numberOfPage,
    user: req.user,
  });
});

Router.post("/:categoryName/getTopics", async (req, res) => {
  const categoryName = req.params.categoryName;
  const courseCategory = await CourseCategory.findOne({ name: categoryName });

  if (!courseCategory) {
    return res.json([]);
  }

  const topics = await CourseTopic.find({
    idCourseCategory: courseCategory._id,
  }, ["name"]);

  return res.json(topics);
});

Router.get("/:categoryName", async (req, res) => {
  const categoryName = req.params.categoryName;
  const category = await CourseCategory.findOne({ name: categoryName });

  if (!category) {
    return renderNotFound(res);
  }

  let page = +req.query.page;
  if (Number.isNaN(page)) {
    page = 1;
  }

  const docs = await Course.find({})
    .populate("idLecturer")
    .populate("idCourseTopic");

  const courses = docs.filter((item) => {
    return item.idCourseTopic
      && item.idCourseTopic.idCourseCategory
      && item.idCourseTopic.idCourseCategory.toString() === category._id.toString();
  });

  const numberOfPage = Math.ceil(courses.length / 5);
  const pagedCourses = courses.slice((page - 1) * 5, (page - 1) * 5 + 5);

  return res.render("./courses/list-courses", {
    isAuthenticated: req.isAuthenticated(),
    title: `Khóa học ${category.name}`,
    courses: pagedCourses,
    page: page,
    isFilter: false,
    numberOfPage: numberOfPage,
    user: req.user,
  });
});

Router.get("/:categoryName/:topicName", async (req, res) => {
  const topicName = req.params.topicName;
  const courseTopic = await CourseTopic.findOne({ name: topicName }).populate("idCourseCategory");

  if (!courseTopic) {
    return renderNotFound(res);
  }

  let page = +req.query.page;
  if (Number.isNaN(page)) {
    page = 1;
  }

  const courses = await Course.find({ idCourseTopic: courseTopic._id })
    .populate("idLecturer")
    .populate("idCourseTopic");

  const numberOfPage = Math.ceil(courses.length / 5);
  const pagedCourses = courses.slice((page - 1) * 5, (page - 1) * 5 + 5);

  return res.render("./courses/list-courses", {
    isAuthenticated: req.isAuthenticated(),
    title: `Khóa học ${courseTopic.name}`,
    courses: pagedCourses,
    page: page,
    isFilter: false,
    numberOfPage: numberOfPage,
    user: req.user,
  });
});

module.exports = Router;
