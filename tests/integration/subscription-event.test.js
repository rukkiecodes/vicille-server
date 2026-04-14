/**
 * Integration tests — POST /internal/subscription-event
 *
 * Covers (per plan section 6.2):
 *  - service-key guard (401 without key)
 *  - SUBSCRIPTION_ACTIVATED  → subscription active + user updated + referral credited
 *  - PAYMENT_SUCCESS         → paymentStatus paid + nextBillingDate advanced
 *  - SUBSCRIPTION_PAYMENT_FAILED → status payment_failed propagated to user
 *  - SUBSCRIPTION_CANCELLED  → status cancelled propagated to user
 *  - PAYMENT_RETRY_SCHEDULED → 200, no DB writes
 *  - unknown event type      → 200, no crash
 *
 * Uses a minimal Express app wrapping the real internal router, with all
 * DB-touching dependencies mocked at module level.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Set env before any module import ────────────────────────────────────────

process.env.INTERNAL_SERVICE_KEY = 'test-svc-key';

// ─── Mutable stub objects ─────────────────────────────────────────────────────

const SubscriptionModelStub = {
  findByIdAndUpdate: async () => {},
};

const UserModelStub = {
  findByIdAndUpdate: async () => {},
};

const ReferralModelStub = {
  rewardInviteForSubscription: async () => null,
};

const AffiliateModelStub = {
  rewardForSubscription: async () => {},
};

// Mutable query — returns empty affiliate rows by default
const dbTarget = {
  query: async () => ({ rows: [] }),
};

const loggerStub = {
  info:  () => {},
  warn:  () => {},
  error: () => {},
};

// ─── Module mocks (before router import) ─────────────────────────────────────

await mock.module('../../src/modules/subscriptions/subscription.model.js', { defaultExport: SubscriptionModelStub });
await mock.module('../../src/modules/users/user.model.js',                  { defaultExport: UserModelStub });
await mock.module('../../src/modules/referrals/referral.model.js',          { defaultExport: ReferralModelStub });
await mock.module('../../src/modules/affiliates/affiliate.model.js',        { defaultExport: AffiliateModelStub });
await mock.module('../../src/infrastructure/database/postgres.js',          { namedExports: { query: (...a) => dbTarget.query(...a) } });
await mock.module('../../src/core/logger/index.js',                         { defaultExport: loggerStub });

// ─── Build minimal test Express app ──────────────────────────────────────────

import express from 'express';
const { default: internalRouter } = await import('../../src/routes/internal.routes.js');

const app = express();
app.use(express.json());
app.use('/internal', internalRouter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function post(path, body, key = 'test-svc-key') {
  const { default: supertest } = await import('supertest');
  const req = supertest(app)
    .post(path)
    .set('Content-Type', 'application/json');
  if (key) req.set('x-service-key', key);
  return req.send(body);
}

// ─── Service-key guard ────────────────────────────────────────────────────────

test('POST /internal/subscription-event — returns 401 without service key', async () => {
  const res = await post('/internal/subscription-event', { type: 'SUBSCRIPTION_ACTIVATED' }, null);
  assert.equal(res.status, 401);
});

test('POST /internal/subscription-event — returns 401 with wrong service key', async () => {
  const res = await post('/internal/subscription-event', { type: 'SUBSCRIPTION_ACTIVATED' }, 'wrong-key');
  assert.equal(res.status, 401);
});

// ─── SUBSCRIPTION_ACTIVATED ───────────────────────────────────────────────────

test('SUBSCRIPTION_ACTIVATED — responds 200 immediately', async () => {
  const res = await post('/internal/subscription-event', {
    type:           'SUBSCRIPTION_ACTIVATED',
    userId:         'user-1',
    subscriptionId: 'sub-1',
    reference:      'VCA-ref',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
});

test('SUBSCRIPTION_ACTIVATED — calls SubscriptionModel.findByIdAndUpdate with status active and paymentStatus paid', async () => {
  const calls = [];
  SubscriptionModelStub.findByIdAndUpdate = async (id, patch) => { calls.push({ id, patch }); };
  UserModelStub.findByIdAndUpdate         = async () => {};
  ReferralModelStub.rewardInviteForSubscription = async () => null;
  dbTarget.query = async () => ({ rows: [] });

  await post('/internal/subscription-event', {
    type:           'SUBSCRIPTION_ACTIVATED',
    userId:         'user-1',
    subscriptionId: 'sub-1',
  });

  // give async work time to complete (response fires before processing)
  await new Promise(r => setTimeout(r, 50));

  const call = calls.find(c => c.id === 'sub-1');
  assert.ok(call, 'Expected SubscriptionModel.findByIdAndUpdate called with sub-1');
  assert.equal(call.patch.status,        'active');
  assert.equal(call.patch.paymentStatus, 'paid');
  assert.ok(call.patch.billing?.nextBillingDate, 'Expected nextBillingDate set');
});

test('SUBSCRIPTION_ACTIVATED — calls UserModel.findByIdAndUpdate with subscriptionStatus active', async () => {
  const userCalls = [];
  SubscriptionModelStub.findByIdAndUpdate      = async () => {};
  UserModelStub.findByIdAndUpdate              = async (id, patch) => { userCalls.push({ id, patch }); };
  ReferralModelStub.rewardInviteForSubscription = async () => null;
  dbTarget.query = async () => ({ rows: [] });

  await post('/internal/subscription-event', {
    type:           'SUBSCRIPTION_ACTIVATED',
    userId:         'user-1',
    subscriptionId: 'sub-1',
  });

  await new Promise(r => setTimeout(r, 50));

  const call = userCalls.find(c => c.id === 'user-1');
  assert.ok(call, 'Expected UserModel.findByIdAndUpdate called with user-1');
  assert.equal(call.patch.subscriptionStatus, 'active');
  assert.equal(call.patch.currentSubscription, 'sub-1');
});

test('SUBSCRIPTION_ACTIVATED — does nothing when subscriptionId or userId is missing', async () => {
  const calls = [];
  SubscriptionModelStub.findByIdAndUpdate = async (...a) => { calls.push(a); };

  await post('/internal/subscription-event', {
    type:   'SUBSCRIPTION_ACTIVATED',
    userId: 'user-1',
    // subscriptionId intentionally omitted
  });

  await new Promise(r => setTimeout(r, 50));
  assert.equal(calls.length, 0);
});

// ─── PAYMENT_SUCCESS ──────────────────────────────────────────────────────────

test('PAYMENT_SUCCESS — updates paymentStatus to paid and advances nextBillingDate', async () => {
  const calls = [];
  SubscriptionModelStub.findByIdAndUpdate = async (id, patch) => { calls.push({ id, patch }); };

  await post('/internal/subscription-event', {
    type:           'PAYMENT_SUCCESS',
    subscriptionId: 'sub-2',
  });

  await new Promise(r => setTimeout(r, 50));

  const call = calls.find(c => c.id === 'sub-2');
  assert.ok(call, 'Expected SubscriptionModel.findByIdAndUpdate called');
  assert.equal(call.patch.paymentStatus, 'paid');
  assert.ok(call.patch.billing?.nextBillingDate, 'Expected nextBillingDate set');
});

test('PAYMENT_SUCCESS — does nothing when subscriptionId is missing', async () => {
  const calls = [];
  SubscriptionModelStub.findByIdAndUpdate = async (...a) => { calls.push(a); };

  await post('/internal/subscription-event', { type: 'PAYMENT_SUCCESS' });

  await new Promise(r => setTimeout(r, 50));
  assert.equal(calls.length, 0);
});

// ─── SUBSCRIPTION_PAYMENT_FAILED ──────────────────────────────────────────────

test('SUBSCRIPTION_PAYMENT_FAILED — sets status payment_failed on subscription and user', async () => {
  const subCalls  = [];
  const userCalls = [];
  SubscriptionModelStub.findByIdAndUpdate = async (id, patch) => { subCalls.push({ id, patch }); };
  UserModelStub.findByIdAndUpdate         = async (id, patch) => { userCalls.push({ id, patch }); };

  await post('/internal/subscription-event', {
    type:           'SUBSCRIPTION_PAYMENT_FAILED',
    userId:         'user-3',
    subscriptionId: 'sub-3',
  });

  await new Promise(r => setTimeout(r, 50));

  const subCall  = subCalls.find(c => c.id === 'sub-3');
  const userCall = userCalls.find(c => c.id === 'user-3');

  assert.ok(subCall,  'Expected subscription update');
  assert.equal(subCall.patch.status,        'payment_failed');
  assert.equal(subCall.patch.paymentStatus, 'failed');

  assert.ok(userCall, 'Expected user update');
  assert.equal(userCall.patch.subscriptionStatus, 'payment_failed');
});

// ─── SUBSCRIPTION_CANCELLED ───────────────────────────────────────────────────

test('SUBSCRIPTION_CANCELLED — sets status cancelled on subscription and user', async () => {
  const subCalls  = [];
  const userCalls = [];
  SubscriptionModelStub.findByIdAndUpdate = async (id, patch) => { subCalls.push({ id, patch }); };
  UserModelStub.findByIdAndUpdate         = async (id, patch) => { userCalls.push({ id, patch }); };

  await post('/internal/subscription-event', {
    type:           'SUBSCRIPTION_CANCELLED',
    userId:         'user-4',
    subscriptionId: 'sub-4',
  });

  await new Promise(r => setTimeout(r, 50));

  const subCall  = subCalls.find(c => c.id === 'sub-4');
  const userCall = userCalls.find(c => c.id === 'user-4');

  assert.ok(subCall,  'Expected subscription update');
  assert.equal(subCall.patch.status, 'cancelled');

  assert.ok(userCall, 'Expected user update');
  assert.equal(userCall.patch.subscriptionStatus, 'cancelled');
});

// ─── PAYMENT_RETRY_SCHEDULED ──────────────────────────────────────────────────

test('PAYMENT_RETRY_SCHEDULED — responds 200 and makes no DB writes', async () => {
  const calls = [];
  SubscriptionModelStub.findByIdAndUpdate = async (...a) => { calls.push(a); };

  const res = await post('/internal/subscription-event', {
    type:           'PAYMENT_RETRY_SCHEDULED',
    subscriptionId: 'sub-5',
    retryAt:        new Date().toISOString(),
  });

  await new Promise(r => setTimeout(r, 50));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 0, 'Expected no DB writes for PAYMENT_RETRY_SCHEDULED');
});

// ─── Unknown event type ───────────────────────────────────────────────────────

test('unknown event type — responds 200 and does not crash', async () => {
  const res = await post('/internal/subscription-event', {
    type: 'SOME_FUTURE_EVENT',
    subscriptionId: 'sub-99',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
});
