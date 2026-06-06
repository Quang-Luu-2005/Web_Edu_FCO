# Admin Login Fix Bugfix Design

## Overview

Users (admin, lecturers, students) cannot log in through the form at `/users/login`. The
`POST /users/login` handler in `source/backend/admin/routers/users.js` performs a manual
account pre-lookup using `req.body.email`, but the login form and the configured Passport
strategy both use the `username` field (`usernameField: 'username'`). Because `req.body.email`
is empty for the submitted form, the lookup `LocalUser.findOne({ email })` never matches a
valid account. The handler then falls into its `!user` branch and renders the OTP page with an
"Invalid account" message, even when the credentials are correct. This blocks the entire
username/password login flow and access to the admin panel.

The fix removes the broken manual pre-lookup and delegates authentication to the existing
`customer` Passport strategy, which already correctly resolves accounts by username or email,
verifies passwords, rejects locked accounts, and gates unverified students behind OTP. A custom
`passport.authenticate` callback then routes the outcome: successful admin/lecturer logins go to
`/admin/homepage`, failures return to the login page with a clear error, and the unverified-OTP
case continues to redirect to the OTP step.

The strategy here is targeted and minimal: change only the route handler so the lookup matches
the actually-submitted form data and the post-authentication routing is correct, while leaving
the Passport strategy, Google login, and OTP/registration flows untouched.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a login submission with valid
  credentials whose account the handler fails to find because it reads a mismatched/empty form
  field (`email`) instead of the actually-submitted identifier (`username`).
- **Property (P)**: The desired behavior — authentication uses the submitted form data, valid
  credentials log in successfully, and users are routed to the correct destination by role.
- **Preservation**: Existing flows that must remain unchanged — OTP step for unverified
  students, Google login, locked-account rejection, and the already-logged-in redirect.
- **loginHandler**: The `Router.post('/login', ...)` handler in
  `source/backend/admin/routers/users.js` that processes login form submissions.
- **customer strategy**: The Passport local strategy registered as `'customer'` in
  `source/backend/config/passport.config.js`, built by `buildLocalStrategy()` with
  `usernameField: 'username'`.
- **findAccountByUsername**: The strategy helper that looks up a `LocalUser` by
  `{ $or: [{ username }, { email: username }] }`.
- **role**: The `LocalUser.role` field (`'admin'`, `'lecturer'`, or `'user'`) that determines
  the post-login redirect destination.
- **isAuth**: The `LocalUser.isAuth` boolean indicating whether a student has completed OTP
  verification.
- **status**: The `LocalUser.status` boolean; `false` means the account is locked.

## Bug Details

### Bug Condition

The bug manifests when a user submits the login form with valid credentials. The `loginHandler`
reads `req.body.email` and runs `LocalUser.findOne({ email })`, but the submitted form provides
the identifier under the `username` field (the same field the `customer` strategy expects via
`usernameField: 'username'`). The `email` value is therefore empty, the lookup matches no
account, and the handler renders the OTP page with "Invalid account" instead of authenticating
the user. Even if the pre-lookup matched, the subsequent `passport.authenticate('customer')`
call reads `req.body.username`, so the two halves of the handler disagree on the field name.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type LoginRequest { body, accounts }
  OUTPUT: boolean

  submittedIdentifier := input.body.username   // field the form/strategy use
  lookupValue         := input.body.email      // field the handler reads

  account := findAccount(submittedIdentifier, input.accounts)

  RETURN account EXISTS
         AND passwordMatches(account, input.body.password)
         AND account.status == true                 // not locked
         AND eligibleForDirectLogin(account)         // admin/lecturer, or verified student
         AND isEmptyOrMismatched(lookupValue)         // handler reads the wrong/empty field
END FUNCTION
```

### Examples

- An admin submits a correct username + password. Expected: logged in and redirected to
  `/admin/homepage`. Actual: redirected to the OTP page with "Invalid account".
- A lecturer submits a correct username + password. Expected: logged in and redirected to
  `/admin/homepage`. Actual: redirected to the OTP page with "Invalid account".
- A verified student submits correct credentials. Expected: logged in and redirected to `/`.
  Actual: redirected to the OTP page with "Invalid account".
- A user submits a wrong password. Expected: returned to the login page with an error message.
  Actual: redirected to the OTP page (wrong destination for a credential error).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Unverified students (role `user`, `isAuth === false`) must continue to be routed to the OTP
  verification step on login (Requirement 3.1).
- Google login via `/users/auth/google` must continue to work exactly as before (Requirement 3.2).
- Locked accounts (`status === false`) must continue to be denied login (Requirement 3.3).
- Already-authenticated users that revisit the login page must continue to be redirected away
  from it (Requirement 3.4).

**Scope:**
All inputs that do NOT involve a valid-credential username/password submission through the
broken handler should be completely unaffected by this fix. This includes:
- Google OAuth login and callback handling.
- The registration flow and OTP verification (`POST /users/register`, `POST /users/otp`).
- Session middleware, `serializeUser`/`deserializeUser`, and the Passport strategy internals.

**Note:** The actual expected correct behavior for valid credentials is defined in the
Correctness Properties section (Property 1).

## Hypothesized Root Cause

Based on the bug description and the code in `users.js` and `passport.config.js`, the most
likely issues are:

1. **Field-name mismatch in the manual pre-lookup**: The handler destructures `email` from
   `req.body` and calls `LocalUser.findOne({ email })`, but the form submits the identifier as
   `username` (matching the strategy's `usernameField: 'username'`). The `email` value is empty,
   so the lookup never matches a valid account.

2. **Redundant and inconsistent authentication path**: The handler performs its own lookup and
   branching before delegating to `passport.authenticate('customer')`. The two halves read
   different fields (`email` vs `username`), so even a matched pre-lookup would still fail in the
   strategy call.

3. **Incorrect failure routing**: On a missing account or wrong password the handler renders the
   OTP page (`res.render('./user/otp')`) with "Invalid account" instead of returning to the
   login page with a clear error.

4. **Missing role-based success redirect**: The `successRedirect` is hard-coded to `/`, so even
   a successful admin/lecturer login would not land on `/admin/homepage`.

## Correctness Properties

Property 1: Bug Condition - Valid Credentials Authenticate And Route By Role

_For any_ login submission where the bug condition holds (a valid, non-locked account exists for
the submitted identifier, the password matches, and the account is eligible for direct login),
the fixed `loginHandler` SHALL authenticate using the actually-submitted form data, establish an
authenticated session, and redirect admin/lecturer users to `/admin/homepage` and other users to
their normal destination. When authentication fails because the account does not exist or the
password is wrong, the handler SHALL return to the login page with a clear error message rather
than rendering the OTP page.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-Direct-Login Flows Unchanged

_For any_ input where the bug condition does NOT hold (Google login, an unverified student
requiring OTP, a locked account, or an already-authenticated user revisiting the login page), the
fixed code SHALL produce the same outcome as the existing correct behavior: unverified students
are routed to the OTP step, Google login continues to work, locked accounts are denied, and
already-authenticated users are redirected away from the login page.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `source/backend/admin/routers/users.js`

**Function**: `Router.post('/login', ...)` (the `loginHandler`)

**Specific Changes**:
1. **Remove the broken manual pre-lookup**: Delete the `const { email } = req.body` /
   `LocalUser.findOne({ email })` block and its `if (user && user.isAuth) / else if / else`
   branching that drives the incorrect OTP redirect.

2. **Delegate to the customer strategy with a custom callback**: Replace the body with
   `passport.authenticate('customer', (err, user, info) => { ... })(req, res, next)`. The
   strategy already reads `usernameField: 'username'`, resolves accounts via
   `findAccountByUsername` (`$or` on `username`/`email`), checks `status`, verifies the password,
   and signals the OTP requirement through `info.needsOtp`.

3. **Handle the success case with a role-based redirect**: On `user` present, call
   `req.logIn(user, ...)` and redirect to `/admin/homepage` when `user.role` is `'admin'` or
   `'lecturer'`, otherwise redirect to `/` (existing student destination).

4. **Handle the OTP case (preservation)**: When `info && info.needsOtp`, set
   `req.session.currentEmail = info.email`, flash the existing OTP prompt, and
   `res.redirect('/users/otp')` — preserving Requirement 3.1.

5. **Handle other failures on the login page**: When authentication fails without `needsOtp`
   (no account, wrong password, locked account), flash `info.message` (e.g. "Tên đăng nhập
   không tồn tại", "Mật khẩu không đúng", "Tài khoản đã bị khóa") and redirect/re-render
   `/users/login` instead of the OTP page — satisfying Requirements 2.2, 2.3 and 3.3.

No changes are required in `passport.config.js`, `auth.js`, `auth_admin.js`, the Google login
routes, or the registration/OTP handlers.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that
demonstrate the bug on the unfixed handler, then verify the fix authenticates valid credentials
correctly and preserves the OTP, Google, locked-account, and already-logged-in behaviors.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm
or refute the root cause analysis (field-name mismatch in the manual pre-lookup). If we refute,
we will need to re-hypothesize.

**Test Plan**: Drive `POST /users/login` (via Supertest or a direct handler invocation with a
mocked `LocalUser`) using the form field the application actually submits (`username`) plus a
correct password, and assert that the response authenticates and redirects appropriately. Run
these against the UNFIXED handler to observe it rendering the OTP page with "Invalid account".

**Test Cases**:
1. **Admin Valid Login**: Submit a valid admin `username` + password (will fail on unfixed code — lands on OTP page).
2. **Lecturer Valid Login**: Submit a valid lecturer `username` + password (will fail on unfixed code).
3. **Verified Student Valid Login**: Submit a valid verified student's credentials (will fail on unfixed code).
4. **Wrong Password Routing**: Submit a valid identifier with a wrong password (may land on OTP page on unfixed code instead of the login page).

**Expected Counterexamples**:
- Valid credentials produce a redirect/response toward the OTP page with "Invalid account".
- Possible causes: handler reads empty `req.body.email`, redundant pre-lookup disagrees with the
  strategy's `username` field, failure branch renders OTP instead of login.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed handler produces
the expected behavior (authenticated session + correct role-based redirect).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := loginHandler_fixed(input)
  ASSERT result.authenticated == true
  ASSERT (input.account.role IN ['admin','lecturer'])
         IMPLIES result.redirect == '/admin/homepage'
  ASSERT (input.account.role == 'user')
         IMPLIES result.redirect == '/'
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed handler
produces the same result as the existing correct behavior.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT loginHandler_original(input) ~= loginHandler_fixed(input)
  // OTP routing for unverified students, Google login, locked-account denial,
  // and already-logged-in redirect remain unchanged
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many account/credential combinations automatically across the input domain.
- It catches edge cases (mixed roles, verified/unverified, locked/unlocked) that manual unit
  tests might miss.
- It provides strong guarantees that non-direct-login behavior is unchanged.

**Test Plan**: Observe behavior on the UNFIXED code first for the OTP, Google, locked-account, and
already-logged-in flows, then write property-based tests capturing that behavior and assert it
holds after the fix.

**Test Cases**:
1. **Unverified Student OTP**: Observe that an unverified student (`role: 'user'`, `isAuth: false`) is routed to the OTP step on unfixed code, then verify this continues after the fix.
2. **Google Login**: Observe that `/users/auth/google` initiates Google OAuth on unfixed code, then verify it is unchanged after the fix.
3. **Locked Account**: Observe that an account with `status: false` is denied on unfixed code (via the strategy), then verify it is still denied after the fix.
4. **Already Logged In**: Observe that revisiting `/users/login` while authenticated redirects away on unfixed code, then verify it continues after the fix.

### Unit Tests

- Login with a valid admin/lecturer identifier + password redirects to `/admin/homepage`.
- Login with a valid verified student redirects to `/`.
- Login with a non-existent account returns to the login page with an error (not the OTP page).
- Login with a wrong password returns to the login page with an error (not the OTP page).
- Login by an unverified student redirects to the OTP step.
- Login by a locked account (`status: false`) is denied.

### Property-Based Tests

- Generate random valid (account, correct password) pairs across roles and assert successful
  authentication with the correct role-based redirect (Property 1).
- Generate random non-bug inputs (Google login, unverified students, locked accounts,
  already-authenticated sessions, wrong passwords) and assert the outcome matches the existing
  correct behavior (Property 2).
- Generate random submitted identifiers (username vs email form of the same account) and assert
  the strategy resolves both consistently.

### Integration Tests

- Full flow: render `GET /users/login`, submit valid admin credentials, follow the redirect, and
  confirm access to `/admin/homepage`.
- Full flow: submit unverified student credentials and confirm the OTP page is reached and OTP
  verification then allows login.
- Context switching: confirm Google login and email/password login coexist without regression,
  and that an already-authenticated user hitting `/users/login` is redirected away.
