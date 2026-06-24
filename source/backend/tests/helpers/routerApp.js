const express = require('express');
const session = require('express-session');

function createRouterApp(router, options = {}) {
  const {
    basePath = '/',
    resolveUser = null,
    extraSetup,
  } = options;

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
  }));

  app.use(async (req, res, next) => {
    res.render = (view, locals = {}) => res.status(res.statusCode || 200).json({ view, locals });
    req.flash = () => {};
    req.logIn = (user, callback) => {
      req.user = user;
      if (callback) callback(null);
    };
    req.logout = () => {};

    if (typeof resolveUser === 'function') {
      req.user = await resolveUser(req);
    }

    req.isAuthenticated = () => Boolean(req.user);
    next();
  });

  if (typeof extraSetup === 'function') {
    extraSetup(app);
  }

  app.post('/__test__/session', (req, res) => {
    Object.assign(req.session, req.body || {});
    res.json({ ok: true });
  });

  app.use(basePath, router);
  return app;
}

module.exports = {
  createRouterApp,
};
