/**
 * Unit tests — Stitchd auth & onboarding (batch 01)
 *
 * Focus: TENANT ISOLATION (doc 01 §3 layer 2). Proves that every tenant-scoped
 * read/write is filtered by the guard-resolved tailorId, so tailor A can never read
 * or modify tailor B's profile:
 *
 *   - StitchdTailorProfileModel.findByTailorId(X) ALWAYS passes X as the scoping param.
 *   - StitchdTailorProfileModel.update(X) scopes its UPDATE WHERE clause by X.
 *   - The stitchdTailor query resolver scopes by requireTailor(context) (the caller's id),
 *     never by an attacker-supplied id.
 *   - completeStitchdBusinessProfile writes only the caller's own row.
 *
 * Strategy: mock.module() stubs the `query` helper to record every (sql, params) call,
 * and to return canned rows keyed by the tailorId in params[0]. This is set up BEFORE
 * the model/resolver is imported.
 *
 * Requires: node --experimental-test-module-mocks --test
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Recorded query calls + mutable query behaviour ───────────────────────────
const queryCalls = [];
let queryImpl = async () => ({ rows: [] });

const queryStub = async (sql, params) => {
  queryCalls.push({ sql, params });
  return queryImpl(sql, params);
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

await mock.module('../../src/infrastructure/database/postgres.js', {
  namedExports: { query: queryStub, getPool: () => ({}), getClient: async () => ({}) },
});
await mock.module('../../src/core/logger/index.js', { defaultExport: loggerStub });
await mock.module('../../src/middlewares/auth.middleware.js', {
  namedExports: {
    generateAccessToken: () => 'access-token',
    generateRefreshToken: () => 'refresh-token',
  },
});
await mock.module('../../src/services/termii.service.js', {
  defaultExport: { sendSms: async () => ({ delivered: false, dev: true }) },
});

const { default: StitchdTailorProfileModel } = await import(
  '../../src/modules/tailors/stitchdTailorProfile.model.js'
);
const { default: stitchdAuthResolvers } = await import(
  '../../src/graphql/resolvers/stitchdAuth.resolvers.js'
);

function reset() {
  queryCalls.length = 0;
  queryImpl = async () => ({ rows: [] });
}

// A canned profile row factory keyed to a tailor id.
function profileRow(tailorId) {
  return {
    tailor_id: tailorId,
    business_name: `Biz ${tailorId}`,
    owner_name: `Owner ${tailorId}`,
    location_city: 'Lagos',
    location_area: 'Ikeja',
    specialties: ['agbada'],
    logo_url: null,
    owner_photo_url: null,
    subscription_status: 'trial',
    tier: 'starter',
    trial_ends_at: new Date('2099-01-01'),
    created_at: new Date('2024-01-01'),
    tailor_phone: '2348011111111',
  };
}

// ─── Model-level isolation ────────────────────────────────────────────────────

test('findByTailorId — always filters by the passed tailorId', async () => {
  reset();
  // Return a row only when queried for tailor B; anything else => empty.
  queryImpl = async (_sql, params) => {
    if (params[0] === 'tailor-B') return { rows: [profileRow('tailor-B')] };
    return { rows: [] };
  };

  const result = await StitchdTailorProfileModel.findByTailorId('tailor-B');

  // The scoping param must be exactly the requested tailorId.
  assert.equal(queryCalls.length, 1);
  assert.equal(queryCalls[0].params[0], 'tailor-B');
  assert.match(queryCalls[0].sql, /WHERE\s+p\.tailor_id\s*=\s*\$1/);
  assert.equal(result.id, 'tailor-B');
});

test('findByTailorId — tailor A cannot read tailor B (row only exists for B)', async () => {
  reset();
  queryImpl = async (_sql, params) => {
    if (params[0] === 'tailor-B') return { rows: [profileRow('tailor-B')] };
    return { rows: [] }; // A has no row of its own here
  };

  const asA = await StitchdTailorProfileModel.findByTailorId('tailor-A');
  assert.equal(asA, null, 'A must not see any row scoped to B');
  assert.equal(queryCalls[0].params[0], 'tailor-A');
});

test('update — scopes the UPDATE WHERE clause by the passed tailorId', async () => {
  reset();
  queryImpl = async (_sql, params) => ({ rows: [profileRow(params[params.length - 1])] });

  await StitchdTailorProfileModel.update('tailor-A', { businessName: 'Hacked Biz' });

  const call = queryCalls[0];
  assert.match(call.sql, /UPDATE\s+stitchd_tailor_profile/i);
  assert.match(call.sql, /WHERE\s+tailor_id\s*=\s*\$\d+/i);
  // Last bound param is the tailorId used in the WHERE — must be the caller's id.
  assert.equal(call.params[call.params.length - 1], 'tailor-A');
});

// ─── Resolver-level isolation (uses the guard's tailorId) ─────────────────────

test('stitchdTailor query — scopes by requireTailor(context), not attacker input', async () => {
  reset();
  queryImpl = async (_sql, params) => {
    if (params[0] === 'tailor-A') return { rows: [profileRow('tailor-A')] };
    return { rows: [] };
  };

  // Context principal is tailor A. There is no way to pass another tailor's id.
  const context = { user: { id: 'tailor-A', role: 'tailor', type: 'tailor' } };
  const result = await stitchdAuthResolvers.Query.stitchdTailor({}, {}, context);

  assert.equal(result.id, 'tailor-A');
  // Every query issued was scoped to A.
  for (const c of queryCalls) {
    assert.equal(c.params[0], 'tailor-A');
  }
});

test('stitchdTailor query — throws UNAUTHENTICATED with no tailor principal', async () => {
  reset();
  await assert.rejects(
    () => stitchdAuthResolvers.Query.stitchdTailor({}, {}, { user: null }),
    (err) => {
      assert.equal(err.extensions?.code, 'UNAUTHENTICATED');
      return true;
    }
  );
});

test('completeStitchdBusinessProfile — writes only the caller B-scoped row', async () => {
  reset();
  // Profile already exists for B; updates + final read both scoped to B.
  queryImpl = async (sql, params) => {
    if (/SELECT \* FROM stitchd_tailor_profile WHERE tailor_id=\$1/.test(sql)) {
      return { rows: [profileRow(params[0])] };
    }
    if (/UPDATE stitchd_tailor_profile/i.test(sql)) {
      return { rows: [profileRow(params[params.length - 1])] };
    }
    if (/JOIN tailors/i.test(sql)) {
      return { rows: [profileRow(params[0])] };
    }
    return { rows: [] };
  };

  const context = { user: { id: 'tailor-B', role: 'tailor', type: 'tailor' } };
  const input = {
    businessName: 'Bespoke B',
    ownerName: 'Bisi',
    locationCity: 'Abuja',
  };

  const result = await stitchdAuthResolvers.Mutation.completeStitchdBusinessProfile(
    {},
    { input },
    context
  );

  assert.equal(result.id, 'tailor-B');
  // No query in the chain may reference any tailor other than B.
  for (const c of queryCalls) {
    if (c.params && c.params.length) {
      const scoping = c.params[0];
      const tail = c.params[c.params.length - 1];
      assert.ok(
        scoping === 'tailor-B' || tail === 'tailor-B',
        `query escaped tenant scope: ${c.sql}`
      );
    }
  }
});

test('completeStitchdBusinessProfile — throws UNAUTHENTICATED without a tailor principal', async () => {
  reset();
  await assert.rejects(
    () =>
      stitchdAuthResolvers.Mutation.completeStitchdBusinessProfile(
        {},
        { input: { businessName: 'X', ownerName: 'Y', locationCity: 'Z' } },
        { user: null }
      ),
    (err) => {
      assert.equal(err.extensions?.code, 'UNAUTHENTICATED');
      return true;
    }
  );
});
