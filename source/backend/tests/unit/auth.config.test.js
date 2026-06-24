const { ensureAuthenticated, forwardAuthenticated } = require('../../config/auth.config');

function createReq({ authenticated = false, user = null } = {}) {
  return {
    user,
    isAuthenticated: jest.fn(() => authenticated),
    flash: jest.fn(),
  };
}

function createRes() {
  return {
    redirect: jest.fn(),
  };
}

describe('auth.config middleware', () => {
  test('ensureAuthenticated calls next for authenticated user', () => {
    const req = createReq({ authenticated: true });
    const res = createRes();
    const next = jest.fn();

    ensureAuthenticated(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('ensureAuthenticated redirects guest to login', () => {
    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    ensureAuthenticated(req, res, next);

    expect(req.flash).toHaveBeenCalledWith('error_msg', 'Please log in to view that resource');
    expect(res.redirect).toHaveBeenCalledWith('/users/login');
    expect(next).not.toHaveBeenCalled();
  });

  test('forwardAuthenticated lets guest continue', () => {
    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    forwardAuthenticated(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('forwardAuthenticated sends admins and lecturers to admin homepage', () => {
    for (const role of ['admin', 'lecturer']) {
      const req = createReq({ authenticated: true, user: { role } });
      const res = createRes();
      forwardAuthenticated(req, res, jest.fn());
      expect(res.redirect).toHaveBeenCalledWith('/admin/homepage');
    }
  });

  test('forwardAuthenticated sends normal users home', () => {
    const req = createReq({ authenticated: true, user: { role: 'guest' } });
    const res = createRes();
    forwardAuthenticated(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/');
  });
});
