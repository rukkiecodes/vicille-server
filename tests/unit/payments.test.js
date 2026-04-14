/**
 * Unit tests — payment resolvers (proxy to payments microservice)
 *
 * Covers (phase 6):
 *  - initializeSubscriptionPayment (plan lookup, active sub conflict, success)
 *  - nigeriaBanks query
 *  - verifyPayment
 *  - auth guards
 *
 * The payment resolver uses the global `fetch` to call the payments service.
 * We replace global.fetch per test to simulate service responses.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stub objects ─────────────────────────────────────────────────────

const SubscriptionPlanModelStub = {
  findById: async () => null,
};

const SubscriptionModelStub = {
  findByUser:        async () => [],
  findByIdAndUpdate: async () => {},
  create:            async () => null,
};

const UserModelStub = {
  findById: async () => null,
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks (before resolver import) ────────────────────────────────────

await mock.module('../../src/modules/subscriptions/subscriptionPlan.model.js', { defaultExport: SubscriptionPlanModelStub });
await mock.module('../../src/modules/subscriptions/subscription.model.js',     { defaultExport: SubscriptionModelStub });
await mock.module('../../src/modules/users/user.model.js',                     { defaultExport: UserModelStub });
await mock.module('../../src/core/logger/index.js',                            { defaultExport: loggerStub });

const { default: paymentResolvers } = await import('../../src/graphql/resolvers/payment.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authCtx  = (id = 'user-1') => ({ user: { id, role: 'user', type: 'user' } });
const adminCtx = ()               => ({ user: { id: 'admin-1', role: 'admin', type: 'admin' } });

/**
 * Replace global.fetch with a function that returns a canned response.
 * Returns a cleanup function to restore the original.
 */
function mockFetch(responseBody, status = 200) {
  const original = global.fetch;
  global.fetch = async () => ({
    ok:   status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(responseBody),
  });
  return () => { global.fetch = original; };
}

function makePlan(overrides = {}) {
  return {
    entityId: 'plan-1',
    id:       'plan-1',
    name:     'Basic',
    isActive: true,
    pricing:  { amount: 5000, currency: 'NGN', billingCycle: 'month' },
    toSafeJSON() { return { id: this.entityId, name: this.name }; },
    ...overrides,
  };
}

function makeSub(overrides = {}) {
  return {
    entityId:      'sub-1',
    id:            'sub-1',
    status:        'pending_payment',
    paymentStatus: 'pending',
    toSafeJSON() { return { id: this.entityId, status: this.status }; },
    ...overrides,
  };
}

// ─── initializeSubscriptionPayment ───────────────────────────────────────────

test('initializeSubscriptionPayment — returns redirectUrl and reference on success', async () => {
  const restore = mockFetch({ ok: true, authorizationUrl: 'https://checkout.paystack.com/xxx', reference: 'VCA-123' });

  SubscriptionPlanModelStub.findById   = async () => makePlan();
  SubscriptionModelStub.findByUser     = async () => [];
  SubscriptionModelStub.create         = async () => makeSub();
  UserModelStub.findById               = async () => ({ email: 'ada@example.com', paystackCustomerCode: 'CUS_abc' });

  try {
    const result = await paymentResolvers.Mutation.initializeSubscriptionPayment(
      null, { planId: 'plan-1' }, authCtx()
    );

    assert.equal(result.redirectUrl, 'https://checkout.paystack.com/xxx');
    assert.equal(result.reference,   'VCA-123');
    assert.equal(result.paymentId,   null);
  } finally {
    restore();
  }
});

test('initializeSubscriptionPayment — throws NOT_FOUND when plan does not exist', async () => {
  SubscriptionPlanModelStub.findById = async () => null;

  await assert.rejects(
    () => paymentResolvers.Mutation.initializeSubscriptionPayment(null, { planId: 'bad-plan' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('initializeSubscriptionPayment — throws CONFLICT when user already has active subscription', async () => {
  SubscriptionPlanModelStub.findById = async () => makePlan();
  SubscriptionModelStub.findByUser   = async () => [makeSub({ status: 'active' })];

  await assert.rejects(
    () => paymentResolvers.Mutation.initializeSubscriptionPayment(null, { planId: 'plan-1' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'CONFLICT'); return true; }
  );
});

test('initializeSubscriptionPayment — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => paymentResolvers.Mutation.initializeSubscriptionPayment(null, { planId: 'plan-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

test('initializeSubscriptionPayment — cancels existing pending_payment subscription before creating new one', async () => {
  const cancelCalls = [];
  const restore = mockFetch({ ok: true, authorizationUrl: 'https://checkout.paystack.com/yyy', reference: 'VCA-456' });

  SubscriptionPlanModelStub.findById   = async () => makePlan();
  SubscriptionModelStub.findByUser     = async () => [makeSub({ status: 'pending_payment', entityId: 'old-sub' })];
  SubscriptionModelStub.findByIdAndUpdate = async (id, patch) => { cancelCalls.push({ id, patch }); };
  SubscriptionModelStub.create         = async () => makeSub({ entityId: 'new-sub' });
  UserModelStub.findById               = async () => ({ email: 'ada@example.com' });

  try {
    await paymentResolvers.Mutation.initializeSubscriptionPayment(null, { planId: 'plan-1' }, authCtx());

    const cancelCall = cancelCalls.find(c => c.patch?.status === 'cancelled');
    assert.ok(cancelCall, 'Expected old pending_payment subscription to be cancelled');
    assert.equal(cancelCall.id, 'old-sub');
  } finally {
    restore();
  }
});

test('initializeSubscriptionPayment — throws PAYMENT_SERVICE_ERROR when payments service fails', async () => {
  const restore = mockFetch({ error: 'Paystack unavailable' }, 502);

  SubscriptionPlanModelStub.findById = async () => makePlan();
  SubscriptionModelStub.findByUser   = async () => [];
  SubscriptionModelStub.create       = async () => makeSub();
  UserModelStub.findById             = async () => ({ email: 'ada@example.com' });

  try {
    await assert.rejects(
      () => paymentResolvers.Mutation.initializeSubscriptionPayment(null, { planId: 'plan-1' }, authCtx()),
      (err) => { assert.equal(err.extensions?.code, 'PAYMENT_SERVICE_ERROR'); return true; }
    );
  } finally {
    restore();
  }
});

// ─── nigeriaBanks query ───────────────────────────────────────────────────────

test('nigeriaBanks — proxies to /authorization/banks and returns result', async () => {
  const banks = [{ name: 'GTBank', code: '058' }, { name: 'Access Bank', code: '044' }];
  const restore = mockFetch({ ok: true, banks, count: 2 });

  try {
    const result = await paymentResolvers.Query.nigeriaBanks(null, {}, authCtx());
    assert.equal(result.count, 2);
  } finally {
    restore();
  }
});

test('nigeriaBanks — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => paymentResolvers.Query.nigeriaBanks(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── verifyPayment mutation ───────────────────────────────────────────────────

test('verifyPayment — proxies reference to /payment/status and returns result', async () => {
  const restore = mockFetch({ ok: true, reference: 'VCA-999', status: 'success' });

  try {
    const result = await paymentResolvers.Mutation.verifyPayment(null, { reference: 'VCA-999' }, authCtx());
    assert.equal(result.status, 'success');
  } finally {
    restore();
  }
});

test('verifyPayment — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => paymentResolvers.Mutation.verifyPayment(null, { reference: 'VCA-999' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── refundPayment mutation ───────────────────────────────────────────────────

test('refundPayment — admin can request a refund', async () => {
  const restore = mockFetch({ ok: true, refundId: 'ref-1', status: 'pending' });

  try {
    const result = await paymentResolvers.Mutation.refundPayment(
      null, { id: 'pay-1', reason: 'Customer request' }, adminCtx()
    );
    assert.ok(result.ok);
  } finally {
    restore();
  }
});

test('refundPayment — throws FORBIDDEN for non-admin authenticated user', async () => {
  await assert.rejects(
    () => paymentResolvers.Mutation.refundPayment(null, { id: 'pay-1', reason: 'x' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});
