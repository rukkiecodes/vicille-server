/**
 * Unit tests — admin resolvers (phase 9)
 *
 * Covers:
 *  Queries:   admin (found/NOT_FOUND), admins (paginated),
 *             dashboardStats (aggregated counts; falls back on error)
 *  Mutations: createAdmin (success/CONFLICT email),
 *             updateAdmin (success/NOT_FOUND),
 *             deleteAdmin (success; BAD_USER_INPUT self-delete),
 *             createClientAccount (success w/ passcode + email; CONFLICT),
 *             suspendUser (success/NOT_FOUND),
 *             reactivateUser (success/NOT_FOUND)
 *  Guards:    all mutations/queries require admin context
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stubs ────────────────────────────────────────────────────────────

const AdminModelStub = {
  findById:          async () => null,
  find:              async () => [],
  countDocuments:    async () => 0,
  emailExists:       async () => false,
  create:            async () => null,
  findByIdAndUpdate: async () => null,
  findByIdAndDelete: async () => {},
};

const UserModelStub = {
  countDocuments:    async () => 0,
  findByEmail:       async () => null,
  create:            async () => null,
  findByIdAndUpdate: async () => null,
};

const TailorModelStub = {
  countDocuments: async () => 0,
};

const OrderModelStub = {
  countDocuments: async () => 0,
};

const SubscriptionModelStub = {
  countDocuments: async () => 0,
};

const emailServiceStub = {
  sendActivationCodeEmail: async () => {},
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks ─────────────────────────────────────────────────────────────

await mock.module('../../src/modules/admin/admin.model.js',                   { defaultExport: AdminModelStub });
await mock.module('../../src/modules/users/user.model.js',                    { defaultExport: UserModelStub });
await mock.module('../../src/modules/tailors/tailor.model.js',                { defaultExport: TailorModelStub });
await mock.module('../../src/modules/orders/order.model.js',                  { defaultExport: OrderModelStub });
await mock.module('../../src/modules/subscriptions/subscription.model.js',    { defaultExport: SubscriptionModelStub });
await mock.module('../../src/services/email.service.js',                      { defaultExport: emailServiceStub });
await mock.module('../../src/core/logger/index.js',                           { defaultExport: loggerStub });
await mock.module('../../src/core/utils/randomCode.js',                       {
  namedExports: { generateActivationCode: () => '123456' },
});

const { default: adminResolvers } = await import('../../src/graphql/resolvers/admin.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminCtx = (id = 'admin-1') => ({ user: { id, role: 'admin', type: 'admin' } });
const userCtx  = (id = 'user-1')  => ({ user: { id, role: 'user',  type: 'user'  } });

function makeAdmin(overrides = {}) {
  const a = {
    id:       'admin-1',
    entityId: 'admin-1',
    email:    'admin@vicelle.com',
    fullName: 'Admin One',
    role:     'admin',
    ...overrides,
  };
  a.toSafeJSON = () => ({ ...a });
  return a;
}

function makeUser(overrides = {}) {
  const u = {
    id:            'user-1',
    entityId:      'user-1',
    email:         'ada@example.com',
    fullName:      'Ada Obi',
    accountStatus: 'active',
    ...overrides,
  };
  u.toSafeJSON = () => ({ ...u });
  return u;
}

// ─── admin query ──────────────────────────────────────────────────────────────

test('admin — returns admin when found', async () => {
  AdminModelStub.findById = async () => makeAdmin();

  const result = await adminResolvers.Query.admin(null, { id: 'admin-1' }, adminCtx());

  assert.equal(result.id, 'admin-1');
  assert.equal(result.email, 'admin@vicelle.com');
});

test('admin — throws NOT_FOUND when admin does not exist', async () => {
  AdminModelStub.findById = async () => null;

  await assert.rejects(
    () => adminResolvers.Query.admin(null, { id: 'missing' }, adminCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('admin — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => adminResolvers.Query.admin(null, { id: 'admin-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── admins query ─────────────────────────────────────────────────────────────

test('admins — returns paginated list', async () => {
  AdminModelStub.find           = async () => [makeAdmin(), makeAdmin({ id: 'admin-2', email: 'b@v.com' })];
  AdminModelStub.countDocuments = async () => 2;

  const result = await adminResolvers.Query.admins(
    null, { pagination: { page: 1, limit: 20 } }, adminCtx()
  );

  assert.equal(result.nodes.length, 2);
  assert.equal(result.pageInfo.total, 2);
});

test('admins — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => adminResolvers.Query.admins(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── dashboardStats query ─────────────────────────────────────────────────────

test('dashboardStats — returns aggregated counts from all models', async () => {
  UserModelStub.countDocuments         = async (f) => f?.accountStatus === 'active' ? 8  : 10;
  TailorModelStub.countDocuments       = async (f) => f?.accountStatus === 'active' ? 3  : 5;
  OrderModelStub.countDocuments        = async (f) => f?.status === 'styling_in_progress' ? 2 : 15;
  SubscriptionModelStub.countDocuments = async () => 7;

  const result = await adminResolvers.Query.dashboardStats(null, {}, adminCtx());

  assert.equal(result.totalUsers,          10);
  assert.equal(result.activeUsers,          8);
  assert.equal(result.totalTailors,         5);
  assert.equal(result.activeTailors,        3);
  assert.equal(result.totalOrders,         15);
  assert.equal(result.pendingOrders,        2);
  assert.equal(result.activeSubscriptions,  7);
});

test('dashboardStats — returns zeros when model calls throw', async () => {
  UserModelStub.countDocuments = async () => { throw new Error('DB down'); };

  const result = await adminResolvers.Query.dashboardStats(null, {}, adminCtx());

  assert.equal(result.totalUsers, 0);
  assert.equal(result.totalOrders, 0);
});

test('dashboardStats — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => adminResolvers.Query.dashboardStats(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── createAdmin mutation ─────────────────────────────────────────────────────

test('createAdmin — creates and returns new admin', async () => {
  AdminModelStub.emailExists = async () => false;
  AdminModelStub.create      = async (data) => makeAdmin({ email: data.email, createdBy: data.createdBy });

  const result = await adminResolvers.Mutation.createAdmin(
    null,
    { input: { email: 'new@vicelle.com', fullName: 'New Admin', role: 'admin' } },
    adminCtx('admin-1')
  );

  assert.equal(result.email,     'new@vicelle.com');
  assert.equal(result.createdBy, 'admin-1');
});

test('createAdmin — throws CONFLICT when email already exists', async () => {
  AdminModelStub.emailExists = async () => true;

  await assert.rejects(
    () => adminResolvers.Mutation.createAdmin(
      null,
      { input: { email: 'exists@vicelle.com', fullName: 'Dup', role: 'admin' } },
      adminCtx()
    ),
    (err) => { assert.equal(err.extensions?.code, 'CONFLICT'); return true; }
  );
});

test('createAdmin — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => adminResolvers.Mutation.createAdmin(null, { input: { email: 'x@y.com' } }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── updateAdmin mutation ─────────────────────────────────────────────────────

test('updateAdmin — updates and returns admin', async () => {
  AdminModelStub.findByIdAndUpdate = async () => makeAdmin({ fullName: 'Updated Admin' });

  const result = await adminResolvers.Mutation.updateAdmin(
    null, { id: 'admin-1', input: { fullName: 'Updated Admin' } }, adminCtx()
  );

  assert.equal(result.fullName, 'Updated Admin');
});

test('updateAdmin — throws NOT_FOUND when admin does not exist', async () => {
  AdminModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => adminResolvers.Mutation.updateAdmin(null, { id: 'missing', input: {} }, adminCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── deleteAdmin mutation ─────────────────────────────────────────────────────

test('deleteAdmin — deletes admin and returns success', async () => {
  AdminModelStub.findByIdAndDelete = async () => {};

  const result = await adminResolvers.Mutation.deleteAdmin(
    null, { id: 'other-admin' }, adminCtx('admin-1')
  );

  assert.equal(result.success, true);
});

test('deleteAdmin — throws BAD_USER_INPUT when admin tries to delete themselves', async () => {
  await assert.rejects(
    () => adminResolvers.Mutation.deleteAdmin(null, { id: 'admin-1' }, adminCtx('admin-1')),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('deleteAdmin — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => adminResolvers.Mutation.deleteAdmin(null, { id: 'admin-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── createClientAccount mutation ─────────────────────────────────────────────

test('createClientAccount — creates user, sends email, returns passcode', async () => {
  const emailCalls = [];

  UserModelStub.findByEmail               = async () => null;
  UserModelStub.create                    = async (data) => makeUser({ email: data.email, fullName: data.fullName });
  emailServiceStub.sendActivationCodeEmail = async (...args) => { emailCalls.push(args); };

  const result = await adminResolvers.Mutation.createClientAccount(
    null,
    { email: 'new@client.com', fullName: 'New Client', phone: '08011112222' },
    adminCtx('admin-1')
  );

  assert.equal(result.success,  true);
  assert.equal(result.passcode, '123456');
  assert.ok(result.user.email === 'new@client.com' || result.user.id);
  assert.equal(emailCalls.length, 1, 'Expected activation email to be sent');
  assert.equal(emailCalls[0][2], '123456');
});

test('createClientAccount — returns success even if email sending fails', async () => {
  UserModelStub.findByEmail               = async () => null;
  UserModelStub.create                    = async () => makeUser({ email: 'x@y.com' });
  emailServiceStub.sendActivationCodeEmail = async () => { throw new Error('SMTP error'); };

  const result = await adminResolvers.Mutation.createClientAccount(
    null, { email: 'x@y.com', fullName: 'Client' }, adminCtx()
  );

  assert.equal(result.success, true);
  assert.equal(result.passcode, '123456');
});

test('createClientAccount — throws CONFLICT when email already registered', async () => {
  UserModelStub.findByEmail = async () => makeUser();

  await assert.rejects(
    () => adminResolvers.Mutation.createClientAccount(
      null, { email: 'ada@example.com', fullName: 'Ada' }, adminCtx()
    ),
    (err) => { assert.equal(err.extensions?.code, 'CONFLICT'); return true; }
  );
});

test('createClientAccount — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => adminResolvers.Mutation.createClientAccount(null, { email: 'x@y.com', fullName: 'X' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── suspendUser / reactivateUser mutations ───────────────────────────────────

test('suspendUser — sets accountStatus to suspended', async () => {
  UserModelStub.findByIdAndUpdate = async () => makeUser({ accountStatus: 'suspended' });

  const result = await adminResolvers.Mutation.suspendUser(
    null, { userId: 'user-1', reason: 'Policy violation' }, adminCtx()
  );

  assert.equal(result.accountStatus, 'suspended');
});

test('suspendUser — throws NOT_FOUND when user does not exist', async () => {
  UserModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => adminResolvers.Mutation.suspendUser(null, { userId: 'missing', reason: 'x' }, adminCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('suspendUser — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => adminResolvers.Mutation.suspendUser(null, { userId: 'user-1', reason: 'x' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

test('reactivateUser — sets accountStatus to active', async () => {
  UserModelStub.findByIdAndUpdate = async () => makeUser({ accountStatus: 'active' });

  const result = await adminResolvers.Mutation.reactivateUser(null, { userId: 'user-1' }, adminCtx());

  assert.equal(result.accountStatus, 'active');
});

test('reactivateUser — throws NOT_FOUND when user does not exist', async () => {
  UserModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => adminResolvers.Mutation.reactivateUser(null, { userId: 'missing' }, adminCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});
