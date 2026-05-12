module.exports = {
    ensureAuthenticated: function(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        req.flash('error_msg', 'Please log in to view that resource');
        res.redirect('/users/login');
    },
    forwardAuthenticated: function(req, res, next){
        if (!req.isAuthenticated()) {
            return next();
        }
        if (req.user && (req.user.role === 'admin' || req.user.role === 'lecturer')) {
            return res.redirect('/admin/homepage');
        }
        res.redirect('/');
    }
}
