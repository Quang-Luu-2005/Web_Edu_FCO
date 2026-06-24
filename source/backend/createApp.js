const express = require('express');
const path = require('path');
require('express-async-errors');

function createApp(options = {}) {
  const {
    connectDb = process.env.NODE_ENV !== 'test',
    configureExternalServices = process.env.NODE_ENV !== 'test',
  } = options;

  const app = express();

  // Static
  const userPublicPath = path.join(__dirname, 'public');
  const adminPublicPath = path.join(__dirname, 'admin/public');

  app.use('/public', express.static(userPublicPath));
  app.use('/public', express.static(adminPublicPath));
  app.use(express.static(userPublicPath));
  app.use(express.static(adminPublicPath));

  // Default body-parser
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  require('./middlewares/dbLocal.mdw')(app, { connectDb });
  require('./middlewares/session.mdw')(app);
  require('./middlewares/passport.mdw')(app);
  require('./middlewares/local.mdw')(app);
  require('./middlewares/view.mdw')(app);
  require('./middlewares/route.mdw')(app);
  require('./middlewares/error.mdw')(app);

  if (configureExternalServices) {
    require('./middlewares/paypal.mdw')(app);
    require('./middlewares/cloudinary.mdw')(app);
  }

  return app;
}

module.exports = createApp;
