/**
 * Unit tests — auth resolvers
 *
 * Covers (per plan section 6.1):
 *  - client login with valid activation code
 *  - client login with invalid activation code
 *  - client login with suspended / pending account
 *  - first-login activation flag set
 *  - tailor login / wrong password / unknown email
 *  - token refresh lifecycle
 *  - requireAuth / requireAdmin guards (helpers.js)
 *
 * Strategy: module-level mock.module() stubs are set up BEFORE the resolver
 * is imported. Each test mutates the stub methods to control behaviour.
 * This avoids ESM module-cache conflicts between top-level tests.
 *
 * Requires: node --experimental-test-module-mocks --test
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stub objects ─────────────────────────────────────────────────────
// These are shared objects. Each test replaces method bodies as needed.

const UserModelStub = {
  findByActivationCode: async () => null,
  resetFailedAttempts:  async () => {},
  findByIdAndUpdate:    async () => {},
  findById:             async () => null,
  findByEmail:          async () => null,
  findByPhone:          async () => null,
  create:               async () => {},
};

const TailorModelStub = {
  findByEmail:       async () => null,
  comparePassword:   async () => false,
  findByIdAndUpdate: async () => {},
  emailExists:       async () => false,
  create:            async () => {},
};

const AdminModelStub = {
  findByEmail:       async () => null,
  comparePassword:   async () => false,
  findByIdAndUpdate: async () => {},
};

const ReferralModelStub = {
  createInviteFromReferralCode: async () => null,
  rewardInviteForSubscription:  async () => null,
};

const NotificationModelStub = {
  create: async () => {},
};

const emailServiceStub = {
  sendActivationCodeEmail: async () => {},
  sendReferralSignupEmail: async () => {},
};

const loggerStub = {
  info:  () => {},
  warn:  () => {},
  error: () => {},
};

// Named exports are captured at import time, so we export wrapper functions
// that delegate to a mutable target object. Tests change the target, not the export.
const authMiddlewareTarget = {
  generateAccessToken:  () => 'access-token',
  generateRefreshToken: () => 'refresh-token',
  verifyRefreshToken:   () => ({ sub: 'user-1', type: 'user', email: 'ada@example.com', role: 'user' }),
};
const authMiddlewareStub = {
  generateAccessToken:  (...a) => authMiddlewareTarget.generateAccessToken(...a),
  generateRefreshToken: (...a) => authMiddlewareTarget.generateRefreshToken(...a),
  verifyRefreshToken:   (...a) => authMiddlewareTarget.verifyRefreshToken(...a),
};

// ─── Module-level mocks (must be set before resolver is imported) ─────────────

await mock.module('../../src/modules/users/user.model.js',            { defaultExport: UserModelStub });
await mock.module('../../src/modules/tailors/tailor.model.js',        { defaultExport: TailorModelStub });
await mock.module('../../src/modules/admin/admin.model.js',           { defaultExport: AdminModelStub });
await mock.module('../../src/modules/referrals/referral.model.js',    { defaultExport: ReferralModelStub });
await mock.module('../../src/modules/notifications/notification.model.js', { defaultExport: NotificationModelStub });
await mock.module('../../src/services/email.service.js',              { defaultExport: emailServiceStub });
await mock.module('../../src/infrastructure/database/postgres.js',    { namedExports: { query: async () => ({ rows: [] }) } });
await mock.module('../../src/core/logger/index.js',                   { defaultExport: loggerStub });
await mock.module('../../src/core/utils/randomCode.js',               { namedExports: { generateActivationCode: () => '000000', generateSessionId: () => 'sess-id' } });
await mock.module('../../src/core/constants/notificationTypes.js',    { namedExports: { NOTIFICATION_TYPE: {}, NOTIFICATION_CHANNEL: {}, NOTIFICATION_STATUS: {} } });
await mock.module('../../src/middlewares/auth.middleware.js',         { namedExports: authMiddlewareStub });

// Import resolver AFTER mocks are registered
const { default: authResolvers } = await import('../../src/graphql/resolvers/auth.resolvers.js');

// No-op fetch for the fire-and-forget Paystack customer call
global.fetch = async () => ({ ok: true, json: async () => ({}) });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    entityId:            'user-1',
    email:               'ada@example.com',
    fullName:            'Ada Obi',
    status:              'active',
    isActivated:         true,
    activationCode:      '123456',
    paystackCustomerCode: null,
    toSafeJSON() { return { id: this.entityId, email: this.email }; },
    ...overrides,
  };
}

function makeTailor(overrides = {}) {
  return {
    entityId: 'tailor-1',
    email:    'tailor@example.com',
    fullName: 'Tunde Bello',
    toSafeJSON() { return { id: this.entityId, email: this.email }; },
    ...overrides,
  };
}

// ─── requireAuth / requireAdmin (helpers.js) ──────────────────────────────────

test('requireAuth — throws UNAUTHENTICATED when context.user is missing', async () => {
  const { requireAuth } = await import('../../src/graphql/helpers.js');
  assert.throws(
    () => requireAuth({}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

test('requireAuth — returns user when present in context', async () => {
  const { requireAuth } = await import('../../src/graphql/helpers.js');
  const user   = { id: 'u1', role: 'user' };
  const result = requireAuth({ user });
  assert.deepEqual(result, user);
});

test('requireAdmin — throws FORBIDDEN for non-admin role', async () => {
  const { requireAdmin } = await import('../../src/graphql/helpers.js');
  assert.throws(
    () => requireAdmin({ user: { id: 'u1', role: 'user', type: 'user' } }),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('requireAdmin — passes for admin role', async () => {
  const { requireAdmin } = await import('../../src/graphql/helpers.js');
  const admin  = { id: 'a1', role: 'admin', type: 'admin' };
  const result = requireAdmin({ user: admin });
  assert.deepEqual(result, admin);
});

// ─── clientLogin ──────────────────────────────────────────────────────────────

test('clientLogin — valid passcode returns tokens and user', async () => {
  const user = makeUser();
  UserModelStub.findByActivationCode = async () => user;
  UserModelStub.resetFailedAttempts  = async () => {};
  UserModelStub.findByIdAndUpdate    = async () => {};
  UserModelStub.findById             = async () => user;

  const result = await authResolvers.Mutation.clientLogin(null, { passcode: '123456' });

  assert.equal(result.accessToken,  'access-token');
  assert.equal(result.refreshToken, 'refresh-token');
  assert.equal(result.type,         'user');
  assert.ok(result.user);
});

test('clientLogin — invalid passcode throws UNAUTHENTICATED', async () => {
  UserModelStub.findByActivationCode = async () => null;

  await assert.rejects(
    () => authResolvers.Mutation.clientLogin(null, { passcode: 'wrong' }),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

test('clientLogin — suspended account throws FORBIDDEN with suspended message', async () => {
  UserModelStub.findByActivationCode = async () => makeUser({ status: 'suspended' });

  await assert.rejects(
    () => authResolvers.Mutation.clientLogin(null, { passcode: '123456' }),
    (err) => {
      assert.equal(err.extensions?.code, 'FORBIDDEN');
      assert.match(err.message, /suspended/);
      return true;
    }
  );
});

test('clientLogin — pending account throws FORBIDDEN with approval message', async () => {
  UserModelStub.findByActivationCode = async () => makeUser({ status: 'pending' });

  await assert.rejects(
    () => authResolvers.Mutation.clientLogin(null, { passcode: '123456' }),
    (err) => {
      assert.equal(err.extensions?.code, 'FORBIDDEN');
      assert.match(err.message, /approval/i);
      return true;
    }
  );
});

test('clientLogin — first login calls findByIdAndUpdate with isActivated: true', async () => {
  const updateCalls = [];
  const user = makeUser({ isActivated: false });

  UserModelStub.findByActivationCode = async () => user;
  UserModelStub.resetFailedAttempts  = async () => {};
  UserModelStub.findByIdAndUpdate    = async (id, patch) => { updateCalls.push({ id, patch }); };
  UserModelStub.findById             = async () => makeUser({ isActivated: true });

  await authResolvers.Mutation.clientLogin(null, { passcode: '123456' });

  const activationCall = updateCalls.find(c => c.patch?.isActivated === true);
  assert.ok(activationCall, 'Expected isActivated: true update call');
  assert.ok(activationCall.patch.activatedAt instanceof Date, 'Expected activatedAt to be a Date');
});

// ─── tailorLogin ─────────────────────────────────────────────────────────────

test('tailorLogin — valid credentials return tokens and tailor', async () => {
  const tailor = makeTailor();
  TailorModelStub.findByEmail       = async () => tailor;
  TailorModelStub.comparePassword   = async () => true;
  TailorModelStub.findByIdAndUpdate = async () => {};

  const result = await authResolvers.Mutation.tailorLogin(
    null,
    { email: 'tailor@example.com', password: 'secret' }
  );

  assert.equal(result.accessToken,  'access-token');
  assert.equal(result.refreshToken, 'refresh-token');
  assert.equal(result.type,         'tailor');
  assert.ok(result.tailor);
});

test('tailorLogin — unknown email throws UNAUTHENTICATED', async () => {
  TailorModelStub.findByEmail = async () => null;

  await assert.rejects(
    () => authResolvers.Mutation.tailorLogin(null, { email: 'nobody@example.com', password: 'x' }),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

test('tailorLogin — wrong password throws UNAUTHENTICATED', async () => {
  TailorModelStub.findByEmail     = async () => makeTailor();
  TailorModelStub.comparePassword = async () => false;

  await assert.rejects(
    () => authResolvers.Mutation.tailorLogin(null, { email: 'tailor@example.com', password: 'wrong' }),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── refreshToken ─────────────────────────────────────────────────────────────

test('refreshToken — valid token issues new access and refresh tokens', async () => {
  authMiddlewareTarget.verifyRefreshToken   = () => ({ sub: 'user-1', type: 'user', email: 'ada@example.com', role: 'user' });
  authMiddlewareTarget.generateAccessToken  = () => 'new-access';
  authMiddlewareTarget.generateRefreshToken = () => 'new-refresh';
  UserModelStub.findById = async () => makeUser();

  const result = await authResolvers.Mutation.refreshToken(null, { refreshToken: 'old-token' });

  assert.equal(result.accessToken,  'new-access');
  assert.equal(result.refreshToken, 'new-refresh');
});

test('refreshToken — invalid token throws UNAUTHENTICATED', async () => {
  authMiddlewareTarget.verifyRefreshToken = () => { throw new Error('jwt malformed'); };

  await assert.rejects(
    () => authResolvers.Mutation.refreshToken(null, { refreshToken: 'bad-token' }),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});
