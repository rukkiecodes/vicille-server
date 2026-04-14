/**
 * Unit tests — tailor resolvers (phase 8)
 *
 * Covers:
 *  Queries: tailor (found/NOT_FOUND/auth), tailors (admin-only, paginated),
 *           availableTailors, tailorsBySpecialty
 *  Mutations: updateTailorProfile, updateTailorCapacity, updateTailorAvailability,
 *             updateTailorPaymentDetails (tailor-only / NOT_FOUND),
 *             verifyTailor, rejectTailor, suspendTailor, reactivateTailor (admin / NOT_FOUND)
 *  Field resolvers: completionRate, isVerified, availability
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stubs ────────────────────────────────────────────────────────────

const TailorModelStub = {
  findById:          async () => null,
  findByIdAndUpdate: async () => null,
  find:              async () => [],
  countDocuments:    async () => 0,
  findAvailable:     async () => [],
  findBySpecialty:   async () => [],
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks ─────────────────────────────────────────────────────────────

await mock.module('../../src/modules/tailors/tailor.model.js', { defaultExport: TailorModelStub });
await mock.module('../../src/core/logger/index.js',            { defaultExport: loggerStub });

const { default: tailorResolvers } = await import('../../src/graphql/resolvers/tailor.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authCtx   = (id = 'user-1')   => ({ user: { id, role: 'user',   type: 'user'   } });
const tailorCtx = (id = 'tailor-1') => ({ user: { id, role: 'tailor', type: 'tailor' } });
const adminCtx  = ()                 => ({ user: { id: 'admin-1', role: 'admin', type: 'admin' } });

function makeTailor(overrides = {}) {
  const t = {
    id:                  'tailor-1',
    entityId:            'tailor-1',
    fullName:            'Chidi Tailor',
    email:               'chidi@example.com',
    status:              'active',
    accountStatus:       'active',
    verificationStatus:  'verified',
    isCapacityReduced:   false,
    totalJobsAssigned:   10,
    totalJobsCompleted:  9,
    bankName:            'GTBank',
    accountNumber:       '0123456789',
    accountName:         'Chidi Tailor',
    ...overrides,
  };
  t.toSafeJSON = () => ({ ...t });
  return t;
}

// ─── tailor query ─────────────────────────────────────────────────────────────

test('tailor — returns tailor when found', async () => {
  TailorModelStub.findById = async () => makeTailor();

  const result = await tailorResolvers.Query.tailor(null, { id: 'tailor-1' }, authCtx());

  assert.equal(result.id, 'tailor-1');
});

test('tailor — throws NOT_FOUND when tailor does not exist', async () => {
  TailorModelStub.findById = async () => null;

  await assert.rejects(
    () => tailorResolvers.Query.tailor(null, { id: 'missing' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('tailor — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => tailorResolvers.Query.tailor(null, { id: 'tailor-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── tailors query (admin) ────────────────────────────────────────────────────

test('tailors — returns paginated list for admin', async () => {
  TailorModelStub.find           = async () => [makeTailor(), makeTailor({ id: 'tailor-2' })];
  TailorModelStub.countDocuments = async () => 2;

  const result = await tailorResolvers.Query.tailors(
    null, { filter: {}, pagination: { page: 1, limit: 20 } }, adminCtx()
  );

  assert.equal(result.nodes.length, 2);
  assert.equal(result.pageInfo.total, 2);
});

test('tailors — throws FORBIDDEN for authenticated non-admin', async () => {
  await assert.rejects(
    () => tailorResolvers.Query.tailors(null, {}, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── availableTailors ─────────────────────────────────────────────────────────

test('availableTailors — returns list of available tailors', async () => {
  TailorModelStub.findAvailable = async () => [makeTailor(), makeTailor({ id: 'tailor-2' })];

  const result = await tailorResolvers.Query.availableTailors(null, {}, authCtx());

  assert.equal(result.length, 2);
});

// ─── tailorsBySpecialty ───────────────────────────────────────────────────────

test('tailorsBySpecialty — returns tailors matching category', async () => {
  TailorModelStub.findBySpecialty = async (cat) =>
    cat === 'ankara' ? [makeTailor()] : [];

  const result = await tailorResolvers.Query.tailorsBySpecialty(null, { category: 'ankara' }, authCtx());

  assert.equal(result.length, 1);
});

// ─── updateTailorProfile ──────────────────────────────────────────────────────

test('updateTailorProfile — updates and returns tailor', async () => {
  const updated = makeTailor({ fullName: 'Chidi Updated' });
  TailorModelStub.findByIdAndUpdate = async () => updated;

  const result = await tailorResolvers.Mutation.updateTailorProfile(
    null, { input: { fullName: 'Chidi Updated' } }, tailorCtx('tailor-1')
  );

  assert.equal(result.fullName, 'Chidi Updated');
});

test('updateTailorProfile — throws NOT_FOUND when tailor does not exist', async () => {
  TailorModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => tailorResolvers.Mutation.updateTailorProfile(null, { input: { fullName: 'X' } }, tailorCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('updateTailorProfile — throws FORBIDDEN for authenticated non-tailor', async () => {
  await assert.rejects(
    () => tailorResolvers.Mutation.updateTailorProfile(null, { input: {} }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── updateTailorCapacity ─────────────────────────────────────────────────────

test('updateTailorCapacity — updates capacity settings', async () => {
  TailorModelStub.findById          = async () => makeTailor();
  TailorModelStub.findByIdAndUpdate = async () => makeTailor({ capacityPerDay: 3 });

  const result = await tailorResolvers.Mutation.updateTailorCapacity(
    null,
    { input: { preferredMaxPerDay: 3, isActive: true } },
    tailorCtx('tailor-1')
  );

  assert.ok(result.id);
});

test('updateTailorCapacity — throws NOT_FOUND when tailor does not exist', async () => {
  TailorModelStub.findById = async () => null;

  await assert.rejects(
    () => tailorResolvers.Mutation.updateTailorCapacity(null, { input: {} }, tailorCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── updateTailorAvailability ─────────────────────────────────────────────────

test('updateTailorAvailability — sets isCapacityReduced from isAvailable flag', async () => {
  const updateCalls = [];
  TailorModelStub.findById          = async () => makeTailor();
  TailorModelStub.findByIdAndUpdate = async (id, patch) => {
    updateCalls.push(patch);
    return makeTailor({ isCapacityReduced: !patch.isCapacityReduced });
  };

  await tailorResolvers.Mutation.updateTailorAvailability(
    null, { input: { isAvailable: false } }, tailorCtx('tailor-1')
  );

  assert.equal(updateCalls[0].isCapacityReduced, true); // !false
});

// ─── updateTailorPaymentDetails ───────────────────────────────────────────────

test('updateTailorPaymentDetails — updates bank details', async () => {
  const updated = makeTailor({ accountNumber: '9999999999' });
  TailorModelStub.findByIdAndUpdate = async () => updated;

  const result = await tailorResolvers.Mutation.updateTailorPaymentDetails(
    null,
    { input: { bankName: 'Access', accountNumber: '9999999999', accountName: 'Chidi' } },
    tailorCtx('tailor-1')
  );

  assert.equal(result.accountNumber, '9999999999');
});

test('updateTailorPaymentDetails — throws NOT_FOUND when tailor does not exist', async () => {
  TailorModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => tailorResolvers.Mutation.updateTailorPaymentDetails(
      null,
      { input: { bankName: 'x', accountNumber: 'x', accountName: 'x' } },
      tailorCtx()
    ),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── verifyTailor (admin) ─────────────────────────────────────────────────────

test('verifyTailor — sets verified status for admin', async () => {
  const updated = makeTailor({ verificationStatus: 'verified', status: 'active' });
  TailorModelStub.findByIdAndUpdate = async () => updated;

  const result = await tailorResolvers.Mutation.verifyTailor(
    null, { id: 'tailor-1', score: 85, notes: 'Good work' }, adminCtx()
  );

  assert.equal(result.verificationStatus, 'verified');
});

test('verifyTailor — throws NOT_FOUND when tailor does not exist', async () => {
  TailorModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => tailorResolvers.Mutation.verifyTailor(null, { id: 'missing', score: 80 }, adminCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('verifyTailor — throws FORBIDDEN for authenticated non-admin', async () => {
  await assert.rejects(
    () => tailorResolvers.Mutation.verifyTailor(null, { id: 'tailor-1' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── rejectTailor / suspendTailor / reactivateTailor ─────────────────────────

test('rejectTailor — sets rejected status for admin', async () => {
  TailorModelStub.findByIdAndUpdate = async () => makeTailor({ verificationStatus: 'rejected' });

  const result = await tailorResolvers.Mutation.rejectTailor(
    null, { id: 'tailor-1', reason: 'Poor quality' }, adminCtx()
  );

  assert.equal(result.verificationStatus, 'rejected');
});

test('suspendTailor — sets suspended status for admin', async () => {
  TailorModelStub.findByIdAndUpdate = async () => makeTailor({ accountStatus: 'suspended' });

  const result = await tailorResolvers.Mutation.suspendTailor(
    null, { id: 'tailor-1', reason: 'Policy violation', until: null }, adminCtx()
  );

  assert.equal(result.accountStatus, 'suspended');
});

test('reactivateTailor — restores active status for admin', async () => {
  TailorModelStub.findByIdAndUpdate = async () => makeTailor({ accountStatus: 'active' });

  const result = await tailorResolvers.Mutation.reactivateTailor(null, { id: 'tailor-1' }, adminCtx());

  assert.equal(result.accountStatus, 'active');
});

test('reactivateTailor — throws NOT_FOUND when tailor does not exist', async () => {
  TailorModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => tailorResolvers.Mutation.reactivateTailor(null, { id: 'missing' }, adminCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── Field resolvers ──────────────────────────────────────────────────────────

test('completionRate — returns 100 when no jobs assigned', () => {
  const rate = tailorResolvers.Tailor.completionRate({ totalJobsAssigned: 0, totalJobsCompleted: 0 });
  assert.equal(rate, 100);
});

test('completionRate — calculates percentage correctly', () => {
  const rate = tailorResolvers.Tailor.completionRate({ totalJobsAssigned: 10, totalJobsCompleted: 8 });
  assert.equal(rate, 80);
});

test('isVerified — true when status is active', () => {
  assert.equal(tailorResolvers.Tailor.isVerified({ status: 'active' }),   true);
  assert.equal(tailorResolvers.Tailor.isVerified({ status: 'verified' }), true);
  assert.equal(tailorResolvers.Tailor.isVerified({ status: 'pending' }),  false);
});

test('availability — isAvailable reflects inverse of isCapacityReduced', () => {
  const avail = tailorResolvers.Tailor.availability({ isCapacityReduced: false });
  assert.equal(avail.isAvailable, true);

  const unavail = tailorResolvers.Tailor.availability({ isCapacityReduced: true });
  assert.equal(unavail.isAvailable, false);
});
