const express = require("express");

const router = express.Router();

const LocalUser = require("../models/LocalUser.model");

const Course = require("../models/Course.model");

const Category = require("../models/CourseCategory.model");

const Topic = require("../models/CourseTopic.model");

const cloudinary = require("cloudinary").v2;

const mongoose = require('mongoose');

const bcrypt = require("bcryptjs");

const passport = require("passport");

const multer = require('multer');

const fs = require('fs');

const path = require('path');

const { readHomeBanners, writeHomeBanners, normalizeBanners } = require("../../config/home-banner.config");

const {
  ensureAuthenticated,
  forwardAuthenticated
} = require("../config/auth_admin");

const normalizeLearnItems = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "")
    .replace(/<\s*p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .split(/\n+/)
    .map((item) => item.replace(/&nbsp;/g, " ").trim())
    .filter(Boolean);
};


// Home Page


router.get("/homepage", ensureAuthenticated,  (req, res) => {
  res.redirect("/admin/course/coursesList");
});

router.get("/home/banners", ensureAuthenticated, (req, res) => {
  let data = [];
  data["title"] = "Banner trang chu";
  data["banners"] = readHomeBanners();
  res.render("admin/home/banners", {
    user: req.user,
    data: data
  });
});

router.post("/home/banners", ensureAuthenticated, (req, res) => {
  // Nhận banners[] từ URLSearchParams
  let raw = req.body['banners[]'] || req.body.banners || [];
  if (!Array.isArray(raw)) raw = [raw];
  raw = raw.filter(Boolean);
  console.log('[home/banners POST] saving:', raw.length, 'banners');
  try {
    writeHomeBanners(raw);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[home/banners POST] write error:', err.message);
    return res.json({ ok: false, msg: err.message });
  }
});

router.get("/account/edit", ensureAuthenticated,  (req, res) => {
    let data = [];
    data["title"] = "Thông tin tài khoản";
    res.render("admin/account/edit", {
      user: req.user,data :data
    })
});

router.post("/account/edit", ensureAuthenticated, async (req, res) => {
  const user = await LocalUser.findById(req.user._id);
  if (user) {
    if (req.body.password && req.body.password !== '') {
      user.password = await bcrypt.hash(req.body.password, 10);
    }
    user.name        = req.body.name;
    user.gender      = req.body.gender;
    user.description = req.body.description;
    user.avatar      = req.body.avatar;
    await user.save();
  }
  res.redirect("/admin/account/edit");
});

//route for lecturers
router.get("/lecturer/lecturersList", ensureAuthenticated, async (req, res) => {
  const Lecturers = await LocalUser.find({ role: 'lecturer' });
  res.render("admin/lecturer/lecturersList", {
    user: req.user,
    data: { Lecturers, title: "Danh sách giảng viên" }
  });
});

router.get("/lecturer/lecturerEdit", ensureAuthenticated, async (req, res) => {
  const Lecturer_info = await LocalUser.findOne({ _id: req.query.id, role: 'lecturer' });
  res.render("admin/lecturer/lecturerEdit", {
    user: req.user,
    data: { Lecturer_info, title: "Thông tin giảng viên" }
  });
});

router.post("/lecturer/lecturerEdit", ensureAuthenticated, async (req, res) => {
  const { id, name, gender, password, description, avatar, status } = req.body;
  const user = await LocalUser.findOne({ _id: id, role: 'lecturer' });
  if (user) {
    if (password && password !== '') user.password = await bcrypt.hash(password, 10);
    user.name        = name;
    user.gender      = gender;
    user.description = description;
    user.avatar      = avatar;
    user.status      = status;
    await user.save();
  }
  res.redirect("/admin/lecturer/lecturersList");
});

router.get("/lecturer/lecturerAdd", ensureAuthenticated, (req, res) => {
  res.render("admin/lecturer/lecturerAdd", {
    user: req.user,
    data: { title: "Thêm giảng viên" }
  });
});

router.post("/lecturer/lecturerAdd", ensureAuthenticated, async (req, res) => {
  const { email, name, gender, password, description, status } = req.body;
  const newLecturer = new LocalUser({
    email, name, gender, description, status,
    role: 'lecturer',
    isAuth: true,
    password: await bcrypt.hash(password, 10)
  });
  await newLecturer.save();
  res.redirect("/admin/lecturer/lecturersList");
});

router.get("/lecturer/lecturerDelete", ensureAuthenticated, async (req, res) => {
  const result = await LocalUser.findOneAndDelete({ _id: req.query.id, role: 'lecturer' });
  res.json(result ? true : false);
});

//route for Category
router.get("/course/categoryList", ensureAuthenticated, async (req, res) => {
   
  let data = [];
  let CourseTopics_array = [];
  let CourseCategories_array = [];
  let Category_array = [];

  CourseTopics_array = await Topic.find({}).populate('idCourseCategory').then(
    (CourseTopics)=>{
      if(CourseTopics){
        return CourseTopics;
      }
  });

  CourseCategories_array = await Category.find({});
  
  CourseCategories_array.forEach((Category_item) => {
    Category_array.push(Category_item);
    CourseTopics_array.forEach((Topic_item) =>{
      if(Topic_item.idCourseCategory._id.toString() == Category_item._id.toString()){
        Category_array.push(Topic_item);
      }
    })
  });
  data['Categories'] = Category_array;
  data['title'] = "Danh sách Category";
  res.render("admin/course/categoryList", {
      user: req.user, data:data
  })
  
});
router.get("/course/categoryEdit",ensureAuthenticated, async function (req, res) {
  let data = [];

  let category_info = await  Category.findById(req.query.id);;
  
  if(!category_info){
    category_info =  await  Topic.findById(req.query.id);;
  }

  var Categories = await Category.find({});

  data["category_info"] = category_info;

  data["categories_option"] = Categories;

  data["title"] = "Thông tin Category";
  
  res.render("admin/course/categoryEdit",{
    user:req.user, data:data
  });
});

router.post("/course/categoryEdit",ensureAuthenticated,async function (req, res) {
  const {
    name,
    image,
    parent,
    id
  } = req.body; 

  Category.findById(id).then(async (category)=>{
    if(category){
      category.name = name;
      category.image = image;
      category.save();
    }else{
      Topic.findById(id).then(async (topic)=>{
        if(topic){
          console.log("find topic");
          topic.name = name;
          topic.image = image;
          topic.idCourseCategory = parent;
          topic.save();
        }
      })
    }
  });
  res.redirect("/admin/course/categoryList");
});
router.get("/course/categoryAdd",ensureAuthenticated,async function (req, res) {
  
      let data = [];
      
      var Categories = await Category.find({});
    
    
      data["categories_option"] = Categories;
    
      data["title"] = "Tạo Category";
      
      res.render("admin/course/categoryAdd",{
        user:req.user, data:data
      });
 
});
router.post("/course/categoryAdd",ensureAuthenticated,async function (req, res) {
  const {
    name,
    image,
    parent,
  } = req.body;  


  if(parent == 0){
    const newcategory = new Category({
      name,
    });
    newcategory.save();
  }else{
    const newTopic = new Topic({
      name,
      idCourseCategory:parent,
    });
    newTopic.save();
  }
  res.redirect("/admin/course/categoryList");
});
router.get("/course/categoryDelete",ensureAuthenticated,async function (req, res) {
  Category.findByIdAndDelete(req.query.id).then( async (category)=>{
    if(category){
      res.json(true);
    }else{
      Topic.findByIdAndDelete(req.query.id).then( async (Topic)=>{
        if(Topic){
          res.json(true);
        }else{
          res.json(false);
        }
      });
    }
  });
  
});

router.get("/course/categoryDelete-available",ensureAuthenticated,async function (req, res) {
  Category.findById(req.query.id).then( async (category)=>{
    if(category){
      const topic = await Topic.find({idCourseCategory:category._id});
      if(topic.length > 0){
        res.json(301);
      }
      else{
        res.json(100);
      }
    }else{
      Topic.findById(req.query.id).then( async (topic)=>{
        if(topic){
          const course = await Course.find({idCourseTopic:topic._id});
          if(course.length > 0){
            res.json(302);
          }else{
            res.json(100);
          }
        }else{
          res.json(303);
        }
      });
    }
  });
});
router.get("/course/categoryEdit-available",ensureAuthenticated,async function (req, res) {
  Category.findById(req.query.id).then( async (category)=>{
    if(category){
      const topic = await Topic.find({idCourseCategory:category._id});
      if(topic.length > 0){
        res.json(301);
      }
      else{
        res.json(100);
      }
    }else{
      res.json(100);
    }
  });
});
//route for Student
router.get("/student/studentsList", ensureAuthenticated,  (req, res) => {
   
  LocalUser.find({}, function(err, students) {
      let data = [];
      let students_arr = [];

      students.forEach(function(student) {

        students_arr.push(student);

      });

      data['students'] = students_arr;
      data['title'] = "Danh sách học viên";
      res.render("admin/student/studentsList", {
          user: req.user, data:data
      })
  });

  
});
router.get("/student/studentEdit",ensureAuthenticated, async function (req, res) {
  let data = [];

  let student_info = await  LocalUser.findById(req.query.id);;
  

  data["student_info"] = student_info;

  data["title"] = "Thông tin học viên";
  
  res.render("admin/student/studentEdit",{
    user:req.user, data:data
  });
});

router.post("/student/studentEdit",ensureAuthenticated, async function (req, res) {
  const {
    id,
    gender,
    avatar, 
    name,
    password,
    status,
  } = req.body; 

  LocalUser.findById(id).then(async (user)=>{
    if(user){
        if( password !==""){
          user.password = await bcrypt.hash(req.body.password, 10);
        }
        user.name = req.body.name;
        user.gender = req.body.gender;
        user.description = req.body.description;
        user.avatar = req.body.avatar;
        user.status = req.body.status;

        user.save();
    }
  });
  res.redirect("/admin/student/studentsList");



  
  
});

router.get("/student/studentAdd",ensureAuthenticated,async function (req, res) {
  let data = [];
  
  data["title"] = "Tạo student";
  
  res.render("admin/student/studentAdd",{
    user:req.user, data:data
  });
});
router.post("/student/studentAdd",ensureAuthenticated,async function (req, res) {
  const {
    email,
    name,
    gender,
    password,
    status
  } = req.body;  

  const newstudent = new LocalUser({
    email,
    name,
    gender,
    password,
    status
  });

  newstudent.save().then(()=>{
    console.log("student save");
  });
  res.redirect("/admin/student/studentsList");
});
router.get("/student/studentDelete",ensureAuthenticated,async function (req, res) {
  LocalUser.findByIdAndDelete(req.query.id).then( async (student)=>{
    if(student){
      res.json(true);
    }else{
      res.json(false);
    }
  });
});




//route for Courses
router.get("/course/coursesList", ensureAuthenticated, async  (req, res) => {
  let data = [];
  let Courses_arr = [];
  

  if(req.user.role == "admin"){
    Courses_arr  = await Course.find();
    if(req.query.lecture_filter){
      Courses_arr  = await Course.find({idLecturer:req.query.lecture_filter});
    }
    if(req.query.category_filter){
      Courses_arr  = await Course.find({idCourseTopic:req.query.category_filter});
    }
    if(req.query.lecture_filter && req.query.category_filter){
      Courses_arr  = await Course.find({idLecturer:req.query.lecture_filter,idCourseTopic:req.query.category_filter});
    }
    
  }else{
    Courses_arr  = await Course.find({idLecturer:req.user._id});
  }

  
  const CourseTopics_array = await Topic.find({}).populate('idCourseCategory').then(
    (CourseTopics)=>{
      if(CourseTopics){
        return CourseTopics;
      }
  });
  //console.log(CourseTopics_array);
  data['CourseTopics_array'] = CourseTopics_array;


  const Lecturers_array = await LocalUser.find({ role: 'lecturer' });

  data['Lecturers_array'] = Lecturers_array;

  data['title'] = "Danh sách khóa học";
  
  data['category_filter'] =req.query.category_filter;
  data['lecture_filter'] =req.query.lecture_filter;

  data['title'] = "Danh sách khóa học";

  data['Courses'] = Courses_arr;
  
  res.render("admin/course/coursesList", {
      user: req.user, data:data
  })
  

    
});

router.get("/course/courseEdit",ensureAuthenticated, async function (req, res) {
  const categories  = await Topic.find({}).populate('idCourseCategory');
  const course_info = await Course.findById(req.query.id);
  res.locals.layout = false;
  res.render("admin/course/courseEdit", {
    user: req.user,
    data: { title: "CHỈNH SỬA KHÓA HỌC", course_info, categories }
  });
});

router.post("/course/courseEdit", ensureAuthenticated, async (req, res) => {
  const { name, lecture_id, category, description, tuition, id, image, status } = req.body;
  const priceType = req.body.priceType === 'contact' ? 'contact' : 'fixed';

  // Parse sessions
  const sessions = [];
  if (req.body.sessions) {
    const raw = req.body.sessions;
    Object.keys(raw).forEach(k => {
      const s = raw[k];
      if (s.title || s.link) {
        sessions.push({
          title: (s.title || '').trim(),
          link:  (s.link  || '').trim(),
          note:  (s.note  || '').trim(),
          date:  s.date ? new Date(s.date) : null
        });
      }
    });
  }

  // Parse discount codes
  const discountCodes = [];
  if (req.body.discountCodes) {
    const raw = req.body.discountCodes;
    Object.keys(raw).forEach(k => {
      const dc = raw[k];
      if (dc.code && dc.code.trim()) {
        discountCodes.push({
          code:      dc.code.trim().toUpperCase(),
          percent:   Number(dc.percent) || 0,
          maxUses:   Number(dc.maxUses) || 0,
          expiresAt: dc.expiresAt ? new Date(dc.expiresAt) : null,
          active:    true
        });
      }
    });
  }

  Course.findById(id).then(c => {
    if (!c) return res.redirect("/admin/course/coursesList");
    c.name          = name;
    c.idLecturer    = lecture_id;
    c.idCourseTopic = category;
    c.description   = description || '';
    c.tuition       = priceType === 'contact' ? 0 : (Number(tuition) || c.tuition);
    c.priceType     = priceType;
    c.poster        = image || c.poster;
    c.status        = status === '1' || status === true;
    c.sessions      = sessions;
    c.discountCodes = discountCodes;
    c.save();
    res.redirect("/admin/course/coursesList");
  });
});

router.get("/course/courseAdd",ensureAuthenticated,async function (req, res) {
  const categories = await Topic.find({}).populate('idCourseCategory');
  res.locals.layout = false;
  res.render("admin/course/courseAdd", {
    user: req.user,
    data: { title: "TẠO KHÓA HỌC", categories }
  });
});
router.post("/course/courseAdd",ensureAuthenticated,async function (req, res) {
  const { name, lecture_id, category, description, tuition, status } = req.body;
  // Ưu tiên markdown nếu có
  const finalDescription = req.body.description_md || description || '';
  const priceType = req.body.priceType === 'contact' ? 'contact' : 'fixed';

  // Tên lấy từ topic trong DB — không phụ thuộc FE
  const categoryId = (category || '').toString().trim();
  let topic = null;
  try {
    if (categoryId && categoryId.length === 24) {
      topic = await Topic.findById(categoryId);
    }
  } catch(e) { console.error('[courseAdd] findById error:', e.message); }
  
  const topicName = topic && topic.name ? String(topic.name) : null;
  const existCount = topicName ? await Course.countDocuments({ idCourseTopic: categoryId }) : 0;
  const finalName = topicName
    ? (existCount > 0 ? `${topicName} #${existCount + 1}` : topicName)
    : `Khóa học ${Date.now()}`;

  console.log('[courseAdd] categoryId:', categoryId, '| topic:', topicName, '| finalName:', finalName);

  // Parse discount codes
  const discountCodes = [];
  if (req.body.discountCodes) {
    const raw = req.body.discountCodes;
    Object.keys(raw).forEach(k => {
      const dc = raw[k];
      if (dc.code && dc.code.trim()) {
        discountCodes.push({
          code:      dc.code.trim().toUpperCase(),
          percent:   Number(dc.percent) || 0,
          maxUses:   Number(dc.maxUses) || 0,
          expiresAt: dc.expiresAt ? new Date(dc.expiresAt) : null,
          active:    true
        });
      }
    });
  }

  const Course_new = new Course({
    name:          finalName,
    idLecturer:    lecture_id,
    idCourseTopic: categoryId,
    description:   finalDescription,
    tuition:       priceType === 'contact' ? 0 : (Number(tuition) || 500000),
    priceType,
    poster:        req.body.image || '',
    status:        status === '1' || status === true,
    discountCodes,
  });

  try {
    await Course_new.save();
    req.flash && req.flash('success_msg', `Đã tạo khóa học "${Course_new.name}" thành công`);
    res.redirect('/admin/course/coursesList');
  } catch (err) {
    console.error('[courseAdd] save error:', err.message);
    // Nếu trùng tên thì thêm timestamp
    if (err.code === 11000) {
      Course_new.name = finalName + ' ' + Date.now().toString().slice(-4);
      await Course_new.save();
      req.flash && req.flash('success_msg', `Đã tạo khóa học thành công`);
      res.redirect('/admin/course/coursesList');
    } else {
      res.redirect('/admin/course/coursesList?error=1');
    }
  }
});

router.get("/course/courseDelete",ensureAuthenticated,async function (req, res) {
  Course.findByIdAndDelete(req.query.id).then( async (student)=>{
    if(student){
      res.json(true);
    }else{
      res.json(false);
    }
  });
});

router.get("/test",async function (req, res) {
   const CourseTopics_array = await Topic.find({}).populate('idCourseCategory').then(
    (CourseTopics)=>{
      let CourseTopics_array = [];
      if(CourseTopics){
        return CourseTopics;
      
      }
    });

});



router.post("/login", function (req, res) {
  res.redirect("/users/login");
});

router.get("/login", function (req, res) {
  res.redirect("/users/login");
});

router.get("/logout", (req, res) => {
  req.logout();
  req.flash("success_msg", "You are logged out");
  res.redirect("/users/login");
});

router.get("/register", function (req, res) {
  let data = [];
  const user = [];
  res.render("admin/common/register",{
    user,data
  });
});

router.get("/is-user-available", ensureAuthenticated, async (req, res) => {
  const user = await LocalUser.findOne({
    email: req.query.email,
    role: { $in: ['admin', 'lecturer'] }
  });
  res.json(user ? false : true);
});

router.get("/is-local-user-available", ensureAuthenticated, async (req, res) => {
  const user = await LocalUser.findOne({ email: req.query.email });
  res.json(user ? false : true);
});






router.post("/register", async (req, res) => {
  const { email, password, re_password } = req.body;
  if (password === re_password) {
    const newUser = new LocalUser({
      email,
      password: await bcrypt.hash(password, 10),
      name: email.split('@')[0],
      gender: 'other',
      role: 'lecturer',
      isAuth: true
    });
    await newUser.save();
  }
  res.redirect("/admin/register");
});

const VerificationRequest = require('../../models/VerificationRequest.model');
const CourseClass = require('../../models/CourseClass.model');

// ── Classes (quản lý lớp học) ──

// List tất cả lớp (admin) hoặc lớp của giảng viên
router.get('/classes', ensureAuthenticated, async (req, res) => {
  const filter = {};
  if (req.user.role !== 'admin') filter.idLecturer = req.user._id;
  if (req.query.courseId) filter.idCourse = req.query.courseId;

  const classes = await CourseClass.find(filter)
    .populate('idCourse', 'name')
    .populate('idLecturer', 'name')
    .sort({ createdAt: -1 });

  const courses = req.user.role === 'admin'
    ? await Course.find({}, 'name')
    : await Course.find({ idLecturer: req.user._id }, 'name');

  res.locals.layout = false;
  res.render('admin/classes/classList', {
    user: req.user,
    data: { title: 'Quản lý lớp học', classes, courses, courseFilter: req.query.courseId || '' }
  });
});

// Form tạo lớp mới
router.get('/classes/new', ensureAuthenticated, async (req, res) => {
  const courses = req.user.role === 'admin'
    ? await Course.find({}, 'name')
    : await Course.find({ idLecturer: req.user._id }, 'name');

  res.locals.layout = false;
  res.render('admin/classes/classForm', {
    user: req.user,
    data: { title: 'Tạo lớp mới', cls: null, courses, isNew: true }
  });
});

router.post('/classes/new', ensureAuthenticated, express.json(), express.urlencoded({ extended: true }), async (req, res) => {
  const { idCourse, name, maxStudents, status } = req.body;
  const cls = new CourseClass({
    idCourse,
    idLecturer: req.user._id,
    name:        name || 'Lớp mới',
    maxStudents: Number(maxStudents) || 10,
    status:      status || 'open'
  });
  await cls.save();
  res.redirect('/admin/classes/' + cls._id);
});

// Chi tiết / chỉnh sửa lớp
router.get('/classes/:classId', ensureAuthenticated, async (req, res) => {
  const cls = await CourseClass.findById(req.params.classId)
    .populate('idCourse', 'name')
    .populate('idLecturer', 'name avatar')
    .populate('students.idUser', 'name avatar username email');

  if (!cls) return res.redirect('/admin/classes');

  // Giảng viên chỉ xem lớp của mình
  if (req.user.role !== 'admin' && cls.idLecturer._id.toString() !== req.user._id.toString()) {
    return res.redirect('/admin/classes');
  }

  res.locals.layout = false;
  res.render('admin/classes/classDetail', {
    user: req.user,
    data: { title: cls.name, cls }
  });
});

// Cập nhật thông tin lớp
router.post('/classes/:classId/update', ensureAuthenticated, express.urlencoded({ extended: true }), async (req, res) => {
  const { name, maxStudents, status } = req.body;
  await CourseClass.findByIdAndUpdate(req.params.classId, {
    $set: { name, maxStudents: Number(maxStudents) || 10, status }
  });
  res.redirect('/admin/classes/' + req.params.classId);
});

// Thêm học viên vào lớp
router.post('/classes/:classId/students/add', ensureAuthenticated, express.json(), async (req, res) => {
  const { identifier } = req.body; // email hoặc username
  if (!identifier) return res.json({ ok: false, msg: 'Thiếu thông tin' });

  const student = await LocalUser.findOne({
    $or: [{ email: identifier.trim() }, { username: identifier.trim() }]
  });
  if (!student) return res.json({ ok: false, msg: 'Không tìm thấy người dùng' });

  const cls = await CourseClass.findById(req.params.classId);
  if (!cls) return res.json({ ok: false, msg: 'Không tìm thấy lớp' });

  const already = cls.students.some(s => s.idUser.toString() === student._id.toString());
  if (already) return res.json({ ok: false, msg: 'Học viên đã có trong lớp' });

  if (cls.students.length >= cls.maxStudents) {
    return res.json({ ok: false, msg: `Lớp đã đủ ${cls.maxStudents} học viên` });
  }

  cls.students.push({ idUser: student._id, enrolledAt: new Date() });
  await cls.save();
  return res.json({ ok: true, student: { _id: student._id, name: student.name, email: student.email, avatar: student.avatar, username: student.username } });
});

// Xóa học viên khỏi lớp
router.post('/classes/:classId/students/remove', ensureAuthenticated, express.json(), async (req, res) => {
  const { userId } = req.body;
  await CourseClass.findByIdAndUpdate(req.params.classId, {
    $pull: { students: { idUser: userId } }
  });
  return res.json({ ok: true });
});

// Thêm buổi học
router.post('/classes/:classId/sessions/add', ensureAuthenticated, express.json(), async (req, res) => {
  const { title, date, meetLink, note } = req.body;
  const cls = await CourseClass.findById(req.params.classId);
  if (!cls) return res.json({ ok: false });
  cls.sessions.push({ title, date: date ? new Date(date) : null, meetLink, note, status: 'scheduled' });
  await cls.save();
  const s = cls.sessions[cls.sessions.length - 1];
  return res.json({ ok: true, session: s });
});

// Cập nhật buổi học (link record, status, v.v.)
router.post('/classes/:classId/sessions/:sessionId/update', ensureAuthenticated, express.json(), async (req, res) => {
  const { title, date, meetLink, recordLink, note, status } = req.body;
  const cls = await CourseClass.findById(req.params.classId);
  if (!cls) return res.json({ ok: false });
  const s = cls.sessions.id(req.params.sessionId);
  if (!s) return res.json({ ok: false });
  if (title      !== undefined) s.title      = title;
  if (date       !== undefined) s.date       = date ? new Date(date) : null;
  if (meetLink   !== undefined) s.meetLink   = meetLink;
  if (recordLink !== undefined) s.recordLink = recordLink;
  if (note       !== undefined) s.note       = note;
  if (status     !== undefined) s.status     = status;
  await cls.save();
  return res.json({ ok: true, session: s });
});

// Xóa buổi học
router.post('/classes/:classId/sessions/:sessionId/delete', ensureAuthenticated, async (req, res) => {
  const cls = await CourseClass.findById(req.params.classId);
  if (!cls) return res.json({ ok: false });
  cls.sessions.pull({ _id: req.params.sessionId });
  await cls.save();
  return res.json({ ok: true });
});

// Xóa lớp
router.post('/classes/:classId/delete', ensureAuthenticated, async (req, res) => {
  await CourseClass.findByIdAndDelete(req.params.classId);
  return res.json({ ok: true });
});

// ── Users (gộp student + lecturer) ──
router.get('/users', ensureAuthenticated, async (req, res) => {
  const { role, search } = req.query;
  const filter = {};
  if (role) {
    if (role === 'guest') {
      // guest = role là 'guest', null, hoặc undefined
      filter.$or = [{ role: 'guest' }, { role: null }, { role: { $exists: false } }];
    } else if (['user','lecturer','admin'].includes(role)) {
      filter.role = role;
    }
  }
  if (search && search.trim()) {
    const re = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: re }, { email: re }, { username: re }];
  }
  const users = await LocalUser.find(filter).sort({ date: -1 });
  res.locals.layout = false;
  res.render('admin/users/usersList', {
    user: req.user,
    data: { title: 'Người dùng', users, roleFilter: role || '', search: search || '' }
  });
});

router.post('/users/:id/role', ensureAuthenticated, express.json(), async (req, res) => {
  const { role } = req.body;
  if (!['user','lecturer','admin','guest'].includes(role)) return res.json({ ok: false, msg: 'Role không hợp lệ' });
  // Không cho tự đổi role của chính mình
  if (req.params.id === req.user._id.toString()) return res.json({ ok: false, msg: 'Không thể đổi role của chính mình' });
  const updated = await LocalUser.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true });
  if (!updated) return res.json({ ok: false, msg: 'Không tìm thấy user' });
  return res.json({ ok: true });
});

router.post('/users/:id/status', ensureAuthenticated, express.json(), async (req, res) => {
  const { status } = req.body;
  if (req.params.id === req.user._id.toString()) return res.json({ ok: false, msg: 'Không thể khóa chính mình' });
  const updated = await LocalUser.findByIdAndUpdate(req.params.id, { $set: { status: !!status } }, { new: true });
  if (!updated) return res.json({ ok: false, msg: 'Không tìm thấy user' });
  return res.json({ ok: true });
});

router.post('/users/:id/delete', ensureAuthenticated, async (req, res) => {
  if (req.params.id === req.user._id.toString()) return res.json({ ok: false, msg: 'Không thể xóa chính mình' });
  const deleted = await LocalUser.findByIdAndDelete(req.params.id);
  if (!deleted) return res.json({ ok: false, msg: 'Không tìm thấy user' });
  return res.json({ ok: true });
});
router.get('/verifications', ensureAuthenticated, async (req, res) => {
  const requests = await VerificationRequest.find({ status: 'pending' })
    .populate('userId', 'username name email avatar')
    .sort({ createdAt: 1 });
  res.render('admin/student/verificationsList', {
    user: req.user,
    data: { title: 'Yêu cầu xác nhận học viên', requests }
  });
});

router.post('/verifications/:id/approve', ensureAuthenticated, async (req, res) => {
  const request = await VerificationRequest.findById(req.params.id);
  if (!request) return res.json({ ok: false });

  request.status     = 'approved';
  request.adminNote  = (req.body.adminNote || '').trim();
  request.reviewedAt = new Date();
  await request.save();

  // Đổi role → 'user' (học viên) — dùng userId trực tiếp, không cần populate
  const updated = await LocalUser.findByIdAndUpdate(
    request.userId,
    { $set: { role: 'user' } },
    { new: true }
  );
  console.log('[approve] userId:', request.userId, '| new role:', updated ? updated.role : 'NOT FOUND');

  return res.json({ ok: true });
});

router.post('/verifications/:id/reject', ensureAuthenticated, async (req, res) => {
  const request = await VerificationRequest.findById(req.params.id);
  if (!request) return res.json({ ok: false });
  request.status = 'rejected';
  request.adminNote = (req.body.adminNote || '').trim();
  request.reviewedAt = new Date();
  await request.save();
  return res.json({ ok: true });
});

router.post('/upload', function (req, res) {
  const folderName = req.query.folder || '/upload/';
  const folderCloud = req.query.folder_cloud || 'webctt2/upload';
  const itemId = (req.query.id || 'misc').toString();
  const fileName = req.query.fileType == "video" ? 'video.mp4' : 'avatar.png';
  const uploadDir = path.join(__dirname, '../public', folderName, itemId);

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      fs.mkdir(uploadDir, { recursive: true }, (err) => cb(err, uploadDir));
    },
    filename: function (req, file, cb) {
      cb(null, fileName);
    }
  });

  const upload = multer({ storage });

  upload.single('file')(req, res, function async(err) {
    if (err) {
      console.log(err);
      return res.status(500).json(false);
    }

    const filePath = path.join(uploadDir, fileName);
    const cloudinaryOptions = {
      public_id: folderCloud + '/' + itemId + '/' + fileName,
      chunk_size: 6000000,
    };

    if (req.query.fileType == "video") {
      cloudinaryOptions.resource_type = "video";
    }

    cloudinary.uploader.upload(filePath, cloudinaryOptions, function(error, result) {
      if (error) {
        console.log(error);
        return res.status(500).json(false);
      }

      res.json(result.secure_url || result.url);
    });
  });
});
module.exports = router;
