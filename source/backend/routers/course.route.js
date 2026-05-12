const express = require('express');

const Router = express.Router();

const Course = require('../models/Course.model');

const CourseCategory = require('../models/CourseCategory.model');

const CourseTopic = require('../models/CourseTopic.model');

const LocalUser = require('../models/LocalUser.model');

const {
    ensureAuthenticated
} = require('../config/auth.config');

const safeArray = (value) => Array.isArray(value) ? value : [];

const normalizeLearnItems = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean);
    }

    if (typeof value !== 'string') {
        return [];
    }

    return value
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*p\s*>/gi, '\n')
        .replace(/<\/\s*li\s*>/gi, '\n')
        .replace(/<\s*li[^>]*>/gi, '')
        .replace(/<\s*p[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .split(/\n+/)
        .map((item) => item.replace(/&nbsp;/g, ' ').trim())
        .filter(Boolean);
};

const renderNotFound = (res) => res.status(404).render('./error/404', {
    layout: false
});

const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

const defaultUserProfile = {
    name: 'User',
    avatar: 'https://i.ibb.co/NnbNMtSw/default-avatar.png',
    role: 'user'
};

const normalizeText = (value) => {
    if (typeof value !== 'string') {
        return '';
    }

    return value.replace(/\s+/g, ' ').trim();
};

const normalizeReactionList = (value) => safeArray(value).map((item) => ({
    idUser: item.idUser,
    type: REACTION_TYPES.includes(item.type) ? item.type : 'like',
    date: item.date || new Date()
}));

const normalizeReportList = (value) => safeArray(value).map((item) => ({
    idUser: item.idUser,
    reason: normalizeText(item.reason) || 'Nội dung vi phạm',
    date: item.date || new Date()
}));

const normalizeReplyList = (value) => safeArray(value).map((item) => ({
    _id: item._id,
    idUser: item.idUser,
    reply: item.reply,
    date: item.date || new Date(),
    reactions: normalizeReactionList(item.reactions),
    reports: normalizeReportList(item.reports),
    status: item.status !== false
}));

const normalizeReviewThread = (value) => ({
    _id: value._id,
    idUser: value.idUser,
    review: value.review,
    date: value.date || new Date(),
    reactions: normalizeReactionList(value.reactions),
    replies: normalizeReplyList(value.replies),
    reports: normalizeReportList(value.reports),
    status: value.status !== false
});

const findUserProfileById = async (userId) => {
    if (!userId) return defaultUserProfile;
    const user = await LocalUser.findOne({ _id: userId.toString() });
    if (!user) return defaultUserProfile;
    return {
        name:   user.name   || 'User',
        avatar: user.avatar || defaultUserProfile.avatar,
        role:   user.role   || 'user'
    };
};

const buildReactionSummary = (reactions) => {
    const summary = {};
    REACTION_TYPES.forEach((type) => {
        summary[type] = 0;
    });

    safeArray(reactions).forEach((reaction) => {
        if (summary[reaction.type] !== undefined) {
            summary[reaction.type] += 1;
        }
    });

    summary.total = safeArray(reactions).length;
    return summary;
};

const getReactionByUser = (reactions, userId) => {
    if (!userId) {
        return null;
    }

    const match = safeArray(reactions).find((reaction) => {
        return reaction.idUser && reaction.idUser.toString() === userId.toString();
    });

    return match ? match.type : null;
};

const isPaidCourse = (course, user) => {
    const purchasedCourses = safeArray(user && user.purchasedCourses);
    return purchasedCourses.some((item) => item.idCourse && item.idCourse.toString() === course._id.toString());
};

const ensureCourseAccess = (req, course) => {
    if (req.user && req.user.role === 'admin') {
        return true;
    }

    return isPaidCourse(course, req.user);
};

const buildFaqThreads = async (course, user) => {
    const currentUserId = user && user._id;

    return Promise.all(course.userReviews.map(async (review) => {
        const author = await findUserProfileById(review.idUser);
        const replies = await Promise.all(safeArray(review.replies).filter((reply) => reply.status !== false).map(async (reply) => ({
            id: reply._id ? reply._id.toString() : undefined,
            text: reply.reply,
            date: reply.date,
            author: await findUserProfileById(reply.idUser),
            reactionSummary: buildReactionSummary(reply.reactions),
            currentUserReaction: getReactionByUser(reply.reactions, currentUserId),
            reportCount: safeArray(reply.reports).length,
            isReported: safeArray(reply.reports).length > 0
        })));

        return {
            id: review._id ? review._id.toString() : undefined,
            text: review.review,
            date: review.date,
            author: author,
            reactionSummary: buildReactionSummary(review.reactions),
            currentUserReaction: getReactionByUser(review.reactions, currentUserId),
            replyCount: replies.length,
            reportCount: safeArray(review.reports).length,
            isReported: safeArray(review.reports).length > 0,
            replies: replies
        };
    }));
};

const findReviewById = (course, reviewId) => {
    if (!reviewId) {
        return null;
    }

    return safeArray(course.userReviews).find((review) => {
        return review._id && review._id.toString() === reviewId.toString();
    }) || null;
};

const findReplyById = (review, replyId) => {
    if (!review || !replyId) {
        return null;
    }

    return safeArray(review.replies).find((reply) => {
        return reply._id && reply._id.toString() === replyId.toString();
    }) || null;
};

const toggleReaction = (target, userId, type) => {
    if (!target || !userId || !REACTION_TYPES.includes(type)) {
        return false;
    }

    target.reactions = safeArray(target.reactions);
    const index = target.reactions.findIndex((item) => item.idUser && item.idUser.toString() === userId.toString());

    if (index >= 0 && target.reactions[index].type === type) {
        target.reactions.splice(index, 1);
        return true;
    }

    if (index >= 0) {
        target.reactions[index].type = type;
        target.reactions[index].date = new Date();
        return true;
    }

    target.reactions.push({
        idUser: userId,
        type: type,
        date: new Date()
    });
    return true;
};

const addReport = (target, userId, reason) => {
    if (!target || !userId) {
        return false;
    }

    target.reports = safeArray(target.reports);
    const reportReason = normalizeText(reason) || 'Nội dung vi phạm';
    const index = target.reports.findIndex((item) => item.idUser && item.idUser.toString() === userId.toString());

    if (index >= 0) {
        target.reports[index].reason = reportReason;
        target.reports[index].date = new Date();
    } else {
        target.reports.push({
            idUser: userId,
            reason: reportReason,
            date: new Date()
        });
    }

    return true;
};

Router.get('/:nameCourse', async (req, res) => {
    const nameCourse = req.params.nameCourse.toString();

    const course = await Course.findOne({
            name: nameCourse
        })
        .populate('idLecturer')
        .populate('idCourseTopic');

    if (!course) {
        return renderNotFound(res);
    }

    course.videos = safeArray(course.videos);
    course.previewIndex = safeArray(course.previewIndex);
    course.userEvaluations = safeArray(course.userEvaluations);
    course.userReviews = safeArray(course.userReviews).map(normalizeReviewThread);
    course.whatYoullLearn = normalizeLearnItems(course.whatYoullLearn);
    course.numberOfView = (course.numberOfView || 0) + 1;

    const courseTopicId = course.idCourseTopic && course.idCourseTopic._id;
    const courseCategoryId = course.idCourseTopic && course.idCourseTopic.idCourseCategory;

    await Promise.all([
        Course.updateOne({ _id: course._id }, { $inc: { numberOfView: 1 } }),
        courseTopicId ? CourseTopic.updateOne({ _id: courseTopicId }, { $inc: { numberOfView: 1 } }) : null,
        courseCategoryId ? CourseCategory.updateOne({ _id: courseCategoryId }, { $inc: { numberOfView: 1 } }) : null
    ].filter(Boolean));

    const purchasedCourses = safeArray(req.user && req.user.purchasedCourses);
    const purchasedCourse = purchasedCourses.find((item) => {
        return item.idCourse && item.idCourse.toString() === course._id.toString();
    });
    const isPaid = Boolean(purchasedCourse);
    const isAdmin = Boolean(req.user && req.user.role === 'admin');

    const wishList = safeArray(req.user && req.user.idWishList);
    const isWishCourse = wishList.some((id) => id.toString() === course._id.toString());

    const myEvaluation = req.user ? course.userEvaluations.find((item) => {
        return item.idUser && item.idUser.toString() === req.user._id.toString();
    }) : null;
    const isEvaluate = Boolean(myEvaluation);
    const myEvaluationPoint = myEvaluation ? myEvaluation.point : 1;

    const learnedVideos = safeArray(purchasedCourse && purchasedCourse.learnedVideos);
    const faqThreads = await buildFaqThreads(course, req.user);
    const userReviews = faqThreads.map((thread) => thread.author);

    return res.render('./course/detail', {
        isAuthenticated: req.isAuthenticated(),
        isWishCourse: isWishCourse,
        course: course,
        isPaid: isPaid,
        isAdmin: isAdmin,
        isEvaluate: isEvaluate,
        myEvaluationPoint: myEvaluationPoint,
        userReviews: userReviews,
        faqThreads: faqThreads,
        learnedVideos: learnedVideos,
        user: req.user
    });
});

Router.post('/:nameCourse/evaluate', ensureAuthenticated, async (req, res) => {
    const evaluationPoint = Number(req.body.evaluationPoint);

    if (!Number.isFinite(evaluationPoint)) {
        return res.status(400).json(false);
    }

    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return res.status(404).json(false);
    }

    course.userEvaluations = safeArray(course.userEvaluations);

    const existingEvaluation = course.userEvaluations.find((item) => {
        return item.idUser && item.idUser.toString() === req.user._id.toString();
    });

    if (existingEvaluation) {
        existingEvaluation.point = evaluationPoint;
    } else {
        course.userEvaluations.push({
            idUser: req.user._id,
            point: evaluationPoint
        });
    }

    const sum = course.userEvaluations.reduce((total, item) => total + item.point, 0);
    course.evaluationPoint    = Number((sum / course.userEvaluations.length).toFixed(1));
    course.numberOfEvaluation = course.userEvaluations.length;

    await course.save();
    return res.json(true);
});

Router.post('/:nameCourse/review', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return res.status(404).json(false);
    }

    if (!ensureCourseAccess(req, course)) {
        return res.status(403).json(false);
    }

    const reviewText = normalizeText(req.body.review);

    if (!reviewText) {
        return res.status(400).json(false);
    }

    course.userReviews = safeArray(course.userReviews);
    course.userReviews.push({
        idUser: req.user._id,
        review: reviewText,
        date: new Date(),
        reactions: [],
        replies: [],
        reports: [],
        status: true
    });

    await course.save();
    return res.json(true);
});

Router.post('/:nameCourse/review/:reviewId/reply', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return res.status(404).json(false);
    }

    if (!ensureCourseAccess(req, course)) {
        return res.status(403).json(false);
    }

    const review = findReviewById(course, req.params.reviewId);
    const replyText = normalizeText(req.body.reply);

    if (!review || review.status === false || !replyText) {
        return res.status(400).json(false);
    }

    review.replies = safeArray(review.replies);
    review.replies.push({
        idUser: req.user._id,
        reply: replyText,
        date: new Date(),
        reactions: [],
        reports: [],
        status: true
    });

    await course.save();
    return res.json(true);
});

Router.post('/:nameCourse/review/:reviewId/react', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return res.status(404).json(false);
    }

    if (!ensureCourseAccess(req, course)) {
        return res.status(403).json(false);
    }

    const review = findReviewById(course, req.params.reviewId);
    const targetId = req.body.targetId;
    const target = targetId ? findReplyById(review, targetId) : review;
    const reactionType = req.body.reactionType || 'like';

    if (!target || target.status === false || !toggleReaction(target, req.user._id, reactionType)) {
        return res.status(400).json(false);
    }

    await course.save();
    return res.json(true);
});

Router.post('/:nameCourse/review/:reviewId/report', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return res.status(404).json(false);
    }

    if (!ensureCourseAccess(req, course)) {
        return res.status(403).json(false);
    }

    const review = findReviewById(course, req.params.reviewId);
    const targetId = req.body.targetId;
    const target = targetId ? findReplyById(review, targetId) : review;

    if (!target || target.status === false || !addReport(target, req.user._id, req.body.reason)) {
        return res.status(400).json(false);
    }

    await course.save();
    return res.json(true);
});

Router.post('/:nameCourse/review/:reviewId/delete', ensureAuthenticated, async (req, res) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json(false);
    }

    const course = await Course.findOne({
        name: req.params.nameCourse
    });

    if (!course) {
        return res.status(404).json(false);
    }

    const review = findReviewById(course, req.params.reviewId);

    if (!review) {
        return res.status(404).json(false);
    }

    const targetId = req.body.targetId;

    if (targetId) {
        const index = safeArray(review.replies).findIndex((reply) => {
            return reply._id && reply._id.toString() === targetId.toString();
        });

        if (index < 0) {
            return res.status(404).json(false);
        }

        review.replies.splice(index, 1);
    } else {
        const index = safeArray(course.userReviews).findIndex((item) => {
            return item._id && item._id.toString() === req.params.reviewId.toString();
        });

        if (index < 0) {
            return res.status(404).json(false);
        }

        course.userReviews.splice(index, 1);
    }

    course.markModified('userReviews');
    await course.save();
    return res.json(true);
});

Router.get('/:nameCourse/lessions', ensureAuthenticated, async (req, res) => {
    const nameCourse = req.params.nameCourse;
    const course = await Course.findOne({
        name: nameCourse
    });

    if (!course) {
        return renderNotFound(res);
    }

    return res.redirect(`/course/${encodeURIComponent(nameCourse)}`);
});

module.exports = Router;
