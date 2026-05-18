const express      = require('express');
const Router       = express.Router();
const { PayOS }    = require('@payos/node');
const Course       = require('../models/Course.model');
const CourseCategory = require('../models/CourseCategory.model');
const CourseTopic  = require('../models/CourseTopic.model');
const LocalUser    = require('../models/LocalUser.model');
const { ensureAuthenticated } = require('../config/auth.config');

const safeArray = (v) => Array.isArray(v) ? v : [];

// Lazy init payOS — chỉ tạo khi có đủ credentials
let _payos = null;
function getPayOS() {
    if (!_payos) {
        if (!process.env.PAYOS_CLIENT_ID || !process.env.PAYOS_API_KEY || !process.env.PAYOS_CHECKSUM_KEY) {
            throw new Error('PayOS credentials chưa được cấu hình trong .env');
        }
        _payos = new PayOS(
            process.env.PAYOS_CLIENT_ID,
            process.env.PAYOS_API_KEY,
            process.env.PAYOS_CHECKSUM_KEY
        );
    }
    return _payos;
}

const APP_URL = process.env.APP_URL || 'http://localhost:8000';

const renderNotFound   = (res) => res.status(404).render('./error/404', { layout: false });
const renderServerError = (res) => res.status(500).render('./error/500', { layout: false });

// ── Trang checkout ──
Router.get('/:nameCourse/checkout', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({ name: req.params.nameCourse });
    if (!course) return renderNotFound(res);

    // Kiểm tra đã mua chưa
    const alreadyPaid = safeArray(req.user.purchasedCourses)
        .some(p => p.idCourse && p.idCourse.toString() === course._id.toString());
    if (alreadyPaid) return res.redirect('/my-courses');

    // Khóa học liên hệ riêng — không thanh toán online
    if (course.priceType === 'contact') {
        return res.render('./payment/contact', {
            isAuthenticated: req.isAuthenticated(),
            course,
            user: req.user
        });
    }

    return res.render('./payment/checkout', {
        isAuthenticated: req.isAuthenticated(),
        course,
        user: req.user
    });});

// ── Tạo link thanh toán payOS ──
Router.post('/:nameCourse/checkout', ensureAuthenticated, async (req, res) => {
    const course = await Course.findOne({ name: req.params.nameCourse });
    if (!course) return renderNotFound(res);

    // Mã đơn hàng: timestamp + userId (đảm bảo unique, số nguyên)
    const orderCode = Number(String(Date.now()).slice(-8) + String(req.user._id).slice(-4).replace(/[^0-9]/g, '0'));

    const { discountCode } = req.body;
    let finalAmount = course.tuition;
    let appliedDiscount = null;

    // Áp dụng mã giảm giá nếu có
    if (discountCode) {
        const dc = (course.discountCodes || []).find(d =>
            d.active && d.code === discountCode.trim().toUpperCase() &&
            (!d.expiresAt || new Date() < new Date(d.expiresAt)) &&
            (d.maxUses === 0 || d.usedCount < d.maxUses)
        );
        if (dc) {
            finalAmount = Math.round(finalAmount * (1 - dc.percent / 100));
            appliedDiscount = dc;
        }
    }

    // ── Bypass payOS nếu giá = 0 ──
    if (finalAmount === 0) {
        const purchasedCourses = safeArray(req.user.purchasedCourses);
        const alreadyPaid = purchasedCourses.some(p =>
            p.idCourse && p.idCourse.toString() === course._id.toString()
        );

        if (!alreadyPaid) {
            await Course.updateOne({ _id: course._id }, { $inc: { numberOfStudent: 1 } });

            // Populate lại course để có topic
            await course.populate('idCourseTopic');
            const courseTopicId    = course.idCourseTopic?._id;
            const courseCategoryId = course.idCourseTopic?.idCourseCategory;
            await Promise.all([
                courseTopicId    ? CourseTopic.updateOne({ _id: courseTopicId },    { $inc: { numberOfSignUp: 1 } }) : null,
                courseCategoryId ? CourseCategory.updateOne({ _id: courseCategoryId }, { $inc: { numberOfSignUp: 1 } }) : null
            ].filter(Boolean));

            purchasedCourses.push({
                idCourse:      course._id,
                learnedVideos: [],
                enrolledAt:    new Date(),
                lastLearnedAt: null
            });

            const idCourses = safeArray(req.user.idCourses);
            if (!idCourses.some(id => id.toString() === course._id.toString())) {
                idCourses.push(course._id);
            }

            // Tăng usedCount mã giảm giá
            if (appliedDiscount) {
                appliedDiscount.usedCount = (appliedDiscount.usedCount || 0) + 1;
                await course.save();
            }

            const updated = await LocalUser.findByIdAndUpdate(
                req.user._id,
                { $set: { purchasedCourses, idCourses } },
                { new: true }
            );

            await new Promise((resolve, reject) => {
                req.logIn(updated, err => err ? reject(err) : resolve());
            });
        }

        // Render trang success
        await course.populate('idCourseTopic');
        return res.render('./payment/success', {
            isAuthenticated: req.isAuthenticated(),
            user: req.user,
            course,
            isFree: true,
            amount: 0
        });
    }

    // payOS yêu cầu tối thiểu 1000 VNĐ
    if (finalAmount < 1000) finalAmount = 1000;

    const encodedName = encodeURIComponent(course.name);
    const paymentData = {
        orderCode,
        amount:      finalAmount,
        description: `Khoa hoc ${course.name}`.slice(0, 25), // max 25 ký tự
        items: [{
            name:     course.name.slice(0, 50),
            quantity: 1,
            price:    finalAmount
        }],
        returnUrl: `${APP_URL}/payment/${encodedName}/success?orderCode=${orderCode}`,
        cancelUrl: `${APP_URL}/payment/${encodedName}/cancel`
    };

    try {
        const paymentLink = await getPayOS().createPaymentLink(paymentData);
        // Lưu orderCode vào session để verify sau
        req.session.pendingPayment = {
            orderCode,
            courseId:   course._id.toString(),
            courseName: course.name,
            amount:     finalAmount
        };
        return res.redirect(paymentLink.checkoutUrl);
    } catch (err) {
        console.error('[PayOS create error]', err.message);
        return renderServerError(res);
    }
});

// ── Callback sau khi thanh toán thành công ──
Router.get('/:nameCourse/success', ensureAuthenticated, async (req, res) => {
    const { orderCode, status } = req.query;

    // payOS trả về status=PAID khi thành công
    if (status !== 'PAID') {
        req.flash && req.flash('error_msg', 'Thanh toán chưa hoàn tất');
        return res.redirect('/');
    }

    // Verify với payOS API
    let paymentInfo;
    try {
        paymentInfo = await getPayOS().getPaymentLinkInformation(orderCode);
    } catch (err) {
        console.error('[PayOS verify error]', err.message);
        req.flash && req.flash('error_msg', 'Không thể xác minh thanh toán');
        return res.redirect('/');
    }

    if (paymentInfo.status !== 'PAID') {
        req.flash && req.flash('error_msg', 'Giao dịch chưa được xác nhận');
        return res.redirect('/');
    }

    const course = await Course.findOne({ name: req.params.nameCourse }).populate('idCourseTopic');
    if (!course) return renderNotFound(res);

    // Enroll
    const purchasedCourses = safeArray(req.user.purchasedCourses);
    const alreadyPaid = purchasedCourses.some(p =>
        p.idCourse && p.idCourse.toString() === course._id.toString()
    );

    if (!alreadyPaid) {
        await Course.updateOne({ _id: course._id }, { $inc: { numberOfStudent: 1 } });

        const courseTopicId    = course.idCourseTopic?._id;
        const courseCategoryId = course.idCourseTopic?.idCourseCategory;
        await Promise.all([
            courseTopicId    ? CourseTopic.updateOne({ _id: courseTopicId },    { $inc: { numberOfSignUp: 1 } }) : null,
            courseCategoryId ? CourseCategory.updateOne({ _id: courseCategoryId }, { $inc: { numberOfSignUp: 1 } }) : null
        ].filter(Boolean));

        purchasedCourses.push({
            idCourse:      course._id,
            learnedVideos: [],
            enrolledAt:    new Date(),
            lastLearnedAt: null
        });
        req.user.purchasedCourses = purchasedCourses;

        const idCourses = safeArray(req.user.idCourses);
        if (!idCourses.some(id => id.toString() === course._id.toString())) {
            idCourses.push(course._id);
            req.user.idCourses = idCourses;
        }

        // Tăng usedCount mã giảm giá nếu có
        const pending = req.session.pendingPayment;
        if (pending && pending.amount < course.tuition) {
            // Tìm mã đã dùng và tăng counter
            const dc = (course.discountCodes || []).find(d =>
                d.active && (d.maxUses === 0 || d.usedCount < d.maxUses)
            );
            if (dc) {
                dc.usedCount = (dc.usedCount || 0) + 1;
                await course.save();
            }
        }

        const updated = await LocalUser.findByIdAndUpdate(
            req.user._id,
            { $set: { purchasedCourses: req.user.purchasedCourses, idCourses: req.user.idCourses } },
            { new: true }
        );

        await new Promise((resolve, reject) => {
            req.logIn(updated, err => err ? reject(err) : resolve());
        });
    }

    req.session.pendingPayment = null;
    return res.render('./payment/success', {
        isAuthenticated: req.isAuthenticated(),
        user: req.user,
        course,
        isFree: false,
        amount: paymentInfo.amount || course.tuition
    });
});

// ── Webhook từ payOS (server-to-server) ──
Router.post('/webhook', express.json(), async (req, res) => {
    try {
        const webhookData = getPayOS().verifyPaymentWebhookData(req.body);
        console.log('[PayOS webhook]', webhookData);
        // Xử lý thêm nếu cần (ghi log, gửi email...)
        return res.json({ success: true });
    } catch (err) {
        console.error('[PayOS webhook error]', err.message);
        return res.status(400).json({ success: false });
    }
});

// ── Hủy thanh toán ──
Router.get('/:nameCourse/cancel', ensureAuthenticated, (req, res) => {
    req.session.pendingPayment = null;
    req.flash && req.flash('error_msg', 'Bạn đã hủy thanh toán');
    return res.redirect('/course/' + encodeURIComponent(req.params.nameCourse));
});

// ── Legacy fail route ──
Router.get('/:nameCourse/fail', ensureAuthenticated, (req, res) => {
    return res.redirect('/my-courses');
});

module.exports = Router;
