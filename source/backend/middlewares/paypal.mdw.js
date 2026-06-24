const paypal = require('paypal-rest-sdk');

module.exports = function () {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  require("../config/paypal.config")(paypal);
};
