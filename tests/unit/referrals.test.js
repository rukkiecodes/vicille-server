/**
 * Unit tests — referral resolvers (phase 7)
 *
 * Covers:
 *  - myReferralSummary: canInvite reflects active subscription
 *  - createReferralInvite: subscription gate (FORBIDDEN), email validation,
 *                          success path
 *  - submitReferralCode: missing code (BAD_USER_INPUT), success (fires
 *                        notification + email fire-and-forget), self/unknown → false
 *  - generateMyReferralCode: success
 *  - claimReferralInvite: missing code (BAD_USER_INPUT), success, model error
 *  - auth guards on all mutations + queries
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stubs ────────────────────────────────────────────────────────────

const ReferralModelStub = {
  getSummaryByInviter:       async () => ({ totalInvites: 0, acceptedInvites: 0, walletBalance: 0 }),
  findByInviter:             async () => [],
  getWalletTransactions:     async () => [],
  getUserReferralCode:       async () => null,
  createInvite:              async () => ({ inviteCode: 'ABC123', invitedEmail: 'new@user.com' }),
  generateUserReferralCode:  async () => ({ code: 'VCL-ABCD' }),
  linkUserToReferralCode:    async () => null,
  claimInvite:               async () => ({ claimed: true }),
};

const SubscriptionModelStub = {
  findByUser: async () => [],
};

const UserModelStub = {
  findById: async () => null,
};

const NotificationModelStub = {
  create: async () => ({ id: 'notif-1' }),
};

const emailServiceStub = {
  sendReferralSignupEmail: async () => {},
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks ─────────────────────────────────────────────────────────────

await mock.module('../../src/modules/referrals/referral.model.js',         { defaultExport: ReferralModelStub });
await mock.module('../../src/modules/subscriptions/subscription.model.js', { defaultExport: SubscriptionModelStub });
await mock.module('../../src/modules/users/user.model.js',                 { defaultExport: UserModelStub });
await mock.module('../../src/modules/notifications/notification.model.js', { defaultExport: NotificationModelStub });
await mock.module('../../src/services/email.service.js',                   { defaultExport: emailServiceStub });
await mock.module('../../src/core/logger/index.js',                        { defaultExport: loggerStub });
// notificationTypes constants are plain values — no mock needed; resolver imports them directly.

const { default: referralResolvers } = await import('../../src/graphql/resolvers/referral.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authCtx = (id = 'user-1') => ({ user: { id, role: 'user', type: 'user' } });

function makeActiveSub() {
  return { status: 'active', paymentStatus: 'paid' };
}

function makeUser(overrides = {}) {
  return {
    id:       'user-1',
    fullName: 'Ada Obi',
    email:    'ada@example.com',
    ...overrides,
  };
}

// ─── myReferralSummary ────────────────────────────────────────────────────────

test('myReferralSummary — canInvite is true when user has active paid subscription', async () => {
  SubscriptionModelStub.findByUser     = async () => [makeActiveSub()];
  ReferralModelStub.getSummaryByInviter = async () => ({ totalInvites: 2, acceptedInvites: 1, walletBalance: 500 });

  const result = await referralResolvers.Query.myReferralSummary(null, {}, authCtx());

  assert.equal(result.canInvite, true);
  assert.equal(result.activeSubscription, true);
  assert.equal(result.totalInvites, 2);
});

test('myReferralSummary — canInvite is false when user has no active subscription', async () => {
  SubscriptionModelStub.findByUser     = async () => [];
  ReferralModelStub.getSummaryByInviter = async () => ({ totalInvites: 0, acceptedInvites: 0, walletBalance: 0 });

  const result = await referralResolvers.Query.myReferralSummary(null, {}, authCtx());

  assert.equal(result.canInvite, false);
  assert.equal(result.activeSubscription, false);
});

test('myReferralSummary — canInvite is false when subscription status is not active', async () => {
  SubscriptionModelStub.findByUser     = async () => [{ status: 'paused', paymentStatus: 'paid' }];
  ReferralModelStub.getSummaryByInviter = async () => ({ totalInvites: 0, acceptedInvites: 0, walletBalance: 0 });

  const result = await referralResolvers.Query.myReferralSummary(null, {}, authCtx());

  assert.equal(result.canInvite, false);
});

test('myReferralSummary — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => referralResolvers.Query.myReferralSummary(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── createReferralInvite ─────────────────────────────────────────────────────

test('createReferralInvite — throws FORBIDDEN when user has no active subscription', async () => {
  SubscriptionModelStub.findByUser = async () => [];

  await assert.rejects(
    () => referralResolvers.Mutation.createReferralInvite(null, { invitedEmail: 'friend@test.com' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('createReferralInvite — throws BAD_USER_INPUT for invalid email', async () => {
  SubscriptionModelStub.findByUser = async () => [makeActiveSub()];

  await assert.rejects(
    () => referralResolvers.Mutation.createReferralInvite(null, { invitedEmail: 'not-an-email' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('createReferralInvite — throws BAD_USER_INPUT for empty email', async () => {
  SubscriptionModelStub.findByUser = async () => [makeActiveSub()];

  await assert.rejects(
    () => referralResolvers.Mutation.createReferralInvite(null, { invitedEmail: '  ' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('createReferralInvite — creates invite for subscriber with valid email', async () => {
  SubscriptionModelStub.findByUser = async () => [makeActiveSub()];
  ReferralModelStub.createInvite   = async ({ inviterUserId, invitedEmail }) => ({
    inviteCode: 'XYZ789', inviterUserId, invitedEmail,
  });

  const result = await referralResolvers.Mutation.createReferralInvite(
    null, { invitedEmail: 'Friend@Test.Com' }, authCtx('user-1')
  );

  // Email should be normalised to lowercase
  assert.equal(result.invitedEmail, 'friend@test.com');
  assert.equal(result.inviteCode, 'XYZ789');
});

test('createReferralInvite — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => referralResolvers.Mutation.createReferralInvite(null, { invitedEmail: 'x@y.com' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── submitReferralCode ───────────────────────────────────────────────────────

test('submitReferralCode — throws BAD_USER_INPUT when code is empty', async () => {
  await assert.rejects(
    () => referralResolvers.Mutation.submitReferralCode(null, { referralCode: '' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('submitReferralCode — throws NOT_FOUND when user does not exist', async () => {
  UserModelStub.findById = async () => null;

  await assert.rejects(
    () => referralResolvers.Mutation.submitReferralCode(null, { referralCode: 'VCL-ABCD' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('submitReferralCode — returns false when code is unknown or self-referral', async () => {
  UserModelStub.findById              = async () => makeUser();
  ReferralModelStub.linkUserToReferralCode = async () => null; // unknown/self-referral

  const result = await referralResolvers.Mutation.submitReferralCode(
    null, { referralCode: 'UNKNOWN' }, authCtx('user-1')
  );

  assert.equal(result, false);
});

test('submitReferralCode — returns true on success and fires notification + email (fire-and-forget)', async () => {
  const notifCalls = [];
  const emailCalls = [];

  UserModelStub.findById              = async () => makeUser({ id: 'user-1', fullName: 'Ada Obi' });
  ReferralModelStub.linkUserToReferralCode = async () => ({ referrerId: 'referrer-1' });
  UserModelStub.findById              = async (id) =>
    id === 'user-1'
      ? makeUser({ id: 'user-1', fullName: 'Ada Obi',    email: 'ada@example.com' })
      : makeUser({ id: 'referrer-1', fullName: 'Referrer', email: 'ref@example.com' });

  NotificationModelStub.create         = async (data) => { notifCalls.push(data); return { id: 'n-1' }; };
  emailServiceStub.sendReferralSignupEmail = async (...args) => { emailCalls.push(args); };

  const result = await referralResolvers.Mutation.submitReferralCode(
    null, { referralCode: 'VCL-ABCD' }, authCtx('user-1')
  );

  assert.equal(result, true);

  // fire-and-forget — wait one tick for the microtasks to resolve
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(notifCalls.length, 1, 'Expected one in-app notification');
  assert.equal(emailCalls.length, 1, 'Expected one email');
});

test('submitReferralCode — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => referralResolvers.Mutation.submitReferralCode(null, { referralCode: 'VCL-X' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── generateMyReferralCode ───────────────────────────────────────────────────

test('generateMyReferralCode — returns the generated code', async () => {
  ReferralModelStub.generateUserReferralCode = async () => ({ code: 'VCL-GEN1' });

  const result = await referralResolvers.Mutation.generateMyReferralCode(null, {}, authCtx('user-1'));

  assert.equal(result.code, 'VCL-GEN1');
});

test('generateMyReferralCode — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => referralResolvers.Mutation.generateMyReferralCode(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── claimReferralInvite ──────────────────────────────────────────────────────

test('claimReferralInvite — throws BAD_USER_INPUT when invite code is empty', async () => {
  UserModelStub.findById = async () => makeUser();

  await assert.rejects(
    () => referralResolvers.Mutation.claimReferralInvite(null, { inviteCode: '' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('claimReferralInvite — returns claimed result on success', async () => {
  UserModelStub.findById          = async () => makeUser();
  ReferralModelStub.claimInvite   = async () => ({ claimed: true, reward: 200 });

  const result = await referralResolvers.Mutation.claimReferralInvite(
    null, { inviteCode: 'INVITE-1' }, authCtx('user-1')
  );

  assert.equal(result.claimed, true);
});

test('claimReferralInvite — wraps model error as BAD_USER_INPUT', async () => {
  UserModelStub.findById        = async () => makeUser();
  ReferralModelStub.claimInvite = async () => { throw new Error('Invite already claimed'); };

  await assert.rejects(
    () => referralResolvers.Mutation.claimReferralInvite(null, { inviteCode: 'USED-INVITE' }, authCtx()),
    (err) => {
      assert.equal(err.extensions?.code, 'BAD_USER_INPUT');
      assert.ok(err.message.includes('Invite already claimed'));
      return true;
    }
  );
});

test('claimReferralInvite — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => referralResolvers.Mutation.claimReferralInvite(null, { inviteCode: 'X' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});
