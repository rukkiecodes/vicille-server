/**
 * Unit tests — subscription resolvers
 *
 * Covers (per plan section 6.2):
 *  - create pending subscription (initializeCardSubscription mutation)
 *  - pause / resume / cancel transitions
 *  - mySubscription query
 *
 * Note: activation-via-internal-event is tested in tests/integration/subscription-event.test.js
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stub objects ─────────────────────────────────────────────────────

const SubscriptionPlanModelStub = {
  findById:          async () => null,
  find:              async () => ({ data: [] }),
  findByIdAndUpdate: async () => null,
  create:            async () => null,
};

const SubscriptionModelStub = {
  findByUser:        async () => [],
  findById:          async () => null,
  findByIdAndUpdate: async () => null,
  create:            async () => null,
  find:              async () => [],
  countDocuments:    async () => 0,
};

const UserModelStub = {
  findById:          async () => null,
  findByIdAndUpdate: async () => {},
};

const paymentsServiceStub = {
  ensureCustomer:         async () => ({ customerCode: 'CUS_123', isNew: false }),
  initializeSubscription: async () => ({ authorizationUrl: 'https://checkout.paystack.com/test', reference: 'VCA-123' }),
};

const loggerStub = {
  info:  () => {},
  warn:  () => {},
  error: () => {},
};

// ─── Module mocks (before resolver import) ────────────────────────────────────

await mock.module('../../src/modules/subscriptions/subscriptionPlan.model.js', { defaultExport: SubscriptionPlanModelStub });
await mock.module('../../src/modules/subscriptions/subscription.model.js',     { defaultExport: SubscriptionModelStub });
await mock.module('../../src/modules/users/user.model.js',                     { defaultExport: UserModelStub });
await mock.module('../../src/core/logger/index.js',                            { defaultExport: loggerStub });
await mock.module('../../src/services/paymentsService.js',                     { defaultExport: paymentsServiceStub });

const { default: subscriptionResolvers } = await import('../../src/graphql/resolvers/subscription.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authCtx  = (id = 'user-1') => ({ user: { id, role: 'user',  type: 'user'  } });
const adminCtx = ()               => ({ user: { id: 'admin-1', role: 'admin', type: 'admin' } });

function makePlan(overrides = {}) {
  return {
    entityId: 'plan-1',
    id:       'plan-1',
    name:     'Basic',
    isActive: true,
    pricing:  { amount: 5000, currency: 'NGN', billingCycle: 'month' },
    toSafeJSON() { return { id: this.entityId, name: this.name, pricing: this.pricing }; },
    ...overrides,
  };
}

function makeSub(overrides = {}) {
  return {
    entityId:      'sub-1',
    id:            'sub-1',
    status:        'active',
    paymentStatus: 'pending',
    plan:          'plan-1',
    user:          'user-1',
    toSafeJSON() { return { id: this.entityId, status: this.status, paymentStatus: this.paymentStatus }; },
    ...overrides,
  };
}

// ─── initializeCardSubscription mutation ────────────────────────────────────

test('initializeCardSubscription — throws NOT_FOUND when plan does not exist', async () => {
  SubscriptionPlanModelStub.findById = async () => null;

  await assert.rejects(
    () => subscriptionResolvers.Mutation.initializeCardSubscription(
      null,
      { planId: 'bad-plan' },
      { user: { id: 'user-1', role: 'user', type: 'user', email: 'ada@example.com', fullName: 'Ada Lovelace' } }
    ),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('initializeCardSubscription — throws CONFLICT when user already has an active subscription', async () => {
  SubscriptionPlanModelStub.findById = async () => makePlan({ paystackPlanCode: 'PLN_123' });
  SubscriptionModelStub.findByUser   = async () => [makeSub({ status: 'active' })];

  await assert.rejects(
    () => subscriptionResolvers.Mutation.initializeCardSubscription(
      null,
      { planId: 'plan-1' },
      { user: { id: 'user-1', role: 'user', type: 'user', email: 'ada@example.com', fullName: 'Ada Lovelace' } }
    ),
    (err) => { assert.equal(err.extensions?.code, 'CONFLICT'); return true; }
  );
});

test('initializeCardSubscription — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => subscriptionResolvers.Mutation.initializeCardSubscription(null, { planId: 'plan-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

test('initializeCardSubscription — creates a pending subscription and returns authorization URL', async () => {
  const created = makeSub({ status: 'pending', paymentStatus: 'pending' });
  const updatedUsers = [];

  SubscriptionPlanModelStub.findById = async () => makePlan({ paystackPlanCode: 'PLN_123' });
  SubscriptionModelStub.findByUser = async () => [];
  SubscriptionModelStub.create = async () => created;
  UserModelStub.findByIdAndUpdate = async (id, patch) => { updatedUsers.push({ id, patch }); };
  paymentsServiceStub.ensureCustomer = async () => ({ customerCode: 'CUS_999', isNew: true });
  paymentsServiceStub.initializeSubscription = async () => ({
    authorizationUrl: 'https://checkout.paystack.com/test',
    reference: 'VCA-123',
  });

  const result = await subscriptionResolvers.Mutation.initializeCardSubscription(
    null,
    { planId: 'plan-1' },
    { user: { id: 'user-1', role: 'user', type: 'user', email: 'ada@example.com', fullName: 'Ada Lovelace' } }
  );

  assert.equal(result.authorizationUrl, 'https://checkout.paystack.com/test');
  assert.equal(result.reference, 'VCA-123');
  assert.equal(result.subscriptionId, 'sub-1');
  assert.deepEqual(updatedUsers[0], {
    id: 'user-1',
    patch: { paystackCustomerCode: 'CUS_999' },
  });
});

test('initializeCardSubscription — throws BAD_USER_INPUT when plan has no paystack plan code', async () => {
  SubscriptionPlanModelStub.findById = async () => makePlan({ paystackPlanCode: null });
  SubscriptionModelStub.findByUser = async () => [];

  await assert.rejects(
    () => subscriptionResolvers.Mutation.initializeCardSubscription(
      null,
      { planId: 'plan-1' },
      { user: { id: 'user-1', role: 'user', type: 'user', email: 'ada@example.com', fullName: 'Ada Lovelace' } }
    ),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('initializeCardSubscription — rolls back pending subscription when payment initialization fails', async () => {
  const deleted = [];

  SubscriptionPlanModelStub.findById = async () => makePlan({ paystackPlanCode: 'PLN_123' });
  SubscriptionModelStub.findByUser = async () => [];
  SubscriptionModelStub.create = async () => makeSub({ status: 'pending', paymentStatus: 'pending' });
  SubscriptionModelStub.delete = async (id) => { deleted.push(id); };
  paymentsServiceStub.ensureCustomer = async () => ({ customerCode: 'CUS_999', isNew: true });
  paymentsServiceStub.initializeSubscription = async () => { throw new Error('upstream failed'); };

  await assert.rejects(
    () => subscriptionResolvers.Mutation.initializeCardSubscription(
      null,
      { planId: 'plan-1' },
      { user: { id: 'user-1', role: 'user', type: 'user', email: 'ada@example.com', fullName: 'Ada Lovelace' } }
    ),
    (err) => { assert.equal(err.extensions?.code, 'SERVICE_UNAVAILABLE'); return true; }
  );

  assert.deepEqual(deleted, ['sub-1']);
});

// ─── cancelSubscription mutation ──────────────────────────────────────────────

test('cancelSubscription — cancels active subscription and updates user', async () => {
  const updateCalls = [];
  const sub = makeSub({ status: 'active' });

  SubscriptionModelStub.findByUser        = async () => [sub];
  SubscriptionModelStub.findByIdAndUpdate = async (id, patch) => {
    updateCalls.push({ id, patch });
    return makeSub({ status: 'cancelled' });
  };
  UserModelStub.findByIdAndUpdate = async () => {};

  const result = await subscriptionResolvers.Mutation.cancelSubscription(
    null, { reason: 'No longer needed' }, authCtx()
  );

  assert.equal(result.status, 'cancelled');
  const call = updateCalls.find(c => c.patch?.status === 'cancelled');
  assert.ok(call, 'Expected findByIdAndUpdate called with status: cancelled');
  assert.ok(call.patch.cancellation?.cancelledAt, 'Expected cancellation.cancelledAt set');
});

test('cancelSubscription — throws NOT_FOUND when user has no active subscription', async () => {
  SubscriptionModelStub.findByUser = async () => [];

  await assert.rejects(
    () => subscriptionResolvers.Mutation.cancelSubscription(null, {}, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('cancelSubscription — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => subscriptionResolvers.Mutation.cancelSubscription(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── pauseSubscription mutation ───────────────────────────────────────────────

test('pauseSubscription — pauses active subscription', async () => {
  const sub = makeSub({ status: 'active' });

  SubscriptionModelStub.findByUser        = async () => [sub];
  SubscriptionModelStub.findByIdAndUpdate = async () => makeSub({ status: 'paused' });
  UserModelStub.findByIdAndUpdate         = async () => {};

  const result = await subscriptionResolvers.Mutation.pauseSubscription(null, {}, authCtx());

  assert.equal(result.status, 'paused');
});

test('pauseSubscription — throws NOT_FOUND when no active subscription to pause', async () => {
  SubscriptionModelStub.findByUser = async () => [makeSub({ status: 'paused' })];

  await assert.rejects(
    () => subscriptionResolvers.Mutation.pauseSubscription(null, {}, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── resumeSubscription mutation ──────────────────────────────────────────────

test('resumeSubscription — resumes paused subscription', async () => {
  const sub = makeSub({ status: 'paused' });

  SubscriptionModelStub.findByUser        = async () => [sub];
  SubscriptionModelStub.findByIdAndUpdate = async () => makeSub({ status: 'active' });
  UserModelStub.findByIdAndUpdate         = async () => {};

  const result = await subscriptionResolvers.Mutation.resumeSubscription(null, {}, authCtx());

  assert.equal(result.status, 'active');
});

test('resumeSubscription — throws NOT_FOUND when no paused subscription to resume', async () => {
  SubscriptionModelStub.findByUser = async () => [makeSub({ status: 'active' })];

  await assert.rejects(
    () => subscriptionResolvers.Mutation.resumeSubscription(null, {}, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── mySubscription query ─────────────────────────────────────────────────────

test('mySubscription — returns the active subscription for the user', async () => {
  const sub = makeSub({ status: 'active' });
  SubscriptionModelStub.findByUser = async () => [sub];

  const result = await subscriptionResolvers.Query.mySubscription(null, {}, authCtx());

  assert.equal(result.id,     'sub-1');
  assert.equal(result.status, 'active');
});

test('mySubscription — returns null when user has no active subscription', async () => {
  SubscriptionModelStub.findByUser = async () => [makeSub({ status: 'cancelled' })];

  const result = await subscriptionResolvers.Query.mySubscription(null, {}, authCtx());

  assert.equal(result, null);
});

test('mySubscription — returns null when user has no subscriptions at all', async () => {
  SubscriptionModelStub.findByUser = async () => [];

  const result = await subscriptionResolvers.Query.mySubscription(null, {}, authCtx());

  assert.equal(result, null);
});

test('mySubscription — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => subscriptionResolvers.Query.mySubscription(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});
