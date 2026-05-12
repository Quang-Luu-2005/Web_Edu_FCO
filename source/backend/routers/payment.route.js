const express = require('express');

const Router = express.Router();

const Course = require('../models/Course.model');

const CourseCategory = require('../models/CourseCategory.model');

const CourseTopic = require('../models/CourseTopic.model');

const paypal = require('paypal-rest-sdk');

const {
    ensureAuthenticated
} = require('../config/auth.config');

const safeArray = (value) => Array.isArray(value) ? value : [];

const renderNotFound = (res) => res.status(404).render('./error/404', {
    layout: false
});

const renderServerError = (res) => res.status(500).render('./error/500', {
    layout: false
});

Router.get('/:nameCourse/checkout', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return renderNotFound(res);
    }

    const now = new Date(Date.now());
    const date = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    return res.render('./payment/checkout', {
        isAuthenticated: req.isAuthenticated(),
        course: course,
        date: date,
        user: req.user
    });
});

Router.post('/:nameCourse/checkout', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return renderNotFound(res);
    }

    const name = encodeURIComponent(course.name);
    const success = 'http://localhost:8000/payment/' + name + '/success';
    const fail = 'http://localhost:8000/payment/' + name + '/fail';

    const create_payment_json = {
        intent: "sale",
        payer: {
            payment_method: "paypal",
        },
        redirect_urls: {
            return_url: success,
            cancel_url: fail,
        },
        transactions: [{
            item_list: {
                items: [{
                    name: course.name,
                    sku: "001",
                    price: course.tuition,
                    currency: "USD",
                    quantity: 1,
                }],
            },
            amount: {
                currency: "USD",
                total: course.tuition,
            },
            description: "Thanh toán khóa học online của WEBCTT2",
        }],
    };

    paypal.payment.create(create_payment_json, function (error, payment) {
        if (error) {
            console.log(error);
            return renderServerError(res);
        }

        const approvalLink = payment.links.find((link) => link.rel === "approval_url");
        if (!approvalLink) {
            return renderServerError(res);
        }

        return res.redirect(approvalLink.href);
    });
});

Router.get('/:nameCourse/success', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({
        name: req.params.nameCourse
    }).populate('idCourseTopic');

    if (!course) {
        return renderNotFound(res);
    }

    const purchasedCourses = safeArray(req.user.purchasedCourses);
    req.user.purchasedCourses = purchasedCourses;

    const alreadyPaid = purchasedCourses.some((item) => {
        return item.idCourse && item.idCourse.toString() === course._id.toString();
    });

    if (!alreadyPaid) {
        await Course.updateOne({ _id: course._id }, { $inc: { numberOfStudent: 1 } });

        const courseTopicId = course.idCourseTopic && course.idCourseTopic._id;
        const courseCategoryId = course.idCourseTopic && course.idCourseTopic.idCourseCategory;

        await Promise.all([
            courseTopicId ? CourseTopic.updateOne({ _id: courseTopicId }, { $inc: { numberOfSignUp: 1 } }) : null,
            courseCategoryId ? CourseCategory.updateOne({ _id: courseCategoryId }, { $inc: { numberOfSignUp: 1 } }) : null
        ].filter(Boolean));

        purchasedCourses.push({
            idCourse: course._id,
            learnedVideos: []
        });

        await req.user.save();
    }

    return res.redirect('/my-courses');
});

Router.get('/:nameCourse/fail', ensureAuthenticated, (req, res) => {
    return res.redirect('/my-courses');
});

module.exports = Router;
