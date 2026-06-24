const createApp = require('../../createApp');

function createTestApp(options = {}) {
  return createApp({
    connectDb: false,
    configureExternalServices: false,
    ...options,
  });
}

module.exports = {
  createTestApp,
};
