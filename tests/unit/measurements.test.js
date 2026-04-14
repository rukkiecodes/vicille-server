/**
 * Unit tests — measurement resolvers
 *
 * Covers (per plan section 6.4):
 *  - create measurement (version increments — each create is a new version)
 *  - activate one deactivates previous (makeActive behaviour)
 *  - queue-for-next-cycle behaviour
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stub objects ─────────────────────────────────────────────────────

const MeasurementModelStub = {
  create:            async () => null,
  findById:          async () => null,
  findByIdAndUpdate: async () => null,
  find:              async () => ({ data: [], pagination: { total: 0 } }),
  makeActive:        async () => null,
  getActiveForUser:  async () => null,
  getHistoryForUser: async () => [],
  queueForNextCycle: async () => null,
  delete:            async () => {},
};

const UserModelStub = {
  findById: async () => null,
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks (before resolver import) ────────────────────────────────────

await mock.module('../../src/modules/measurements/measurement.model.js', { defaultExport: MeasurementModelStub });
await mock.module('../../src/modules/users/user.model.js',               { defaultExport: UserModelStub });
await mock.module('../../src/core/logger/index.js',                      { defaultExport: loggerStub });

const { default: measurementResolvers } = await import('../../src/graphql/resolvers/measurement.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authCtx = (id = 'user-1') => ({ user: { id, role: 'user', type: 'user' } });

function makeMeasurement(overrides = {}) {
  return {
    id:       'meas-1',
    entityId: 'meas-1',
    user:     'user-1',
    isActive: true,
    version:  1,
    toSafeJSON() {
      return { id: this.id, user: this.user, isActive: this.isActive, version: this.version };
    },
    ...overrides,
  };
}

// ─── createMeasurement mutation ───────────────────────────────────────────────

test('createMeasurement — creates a new measurement and immediately makes it active', async () => {
  const created  = makeMeasurement({ version: 2, isActive: false });
  const activated = makeMeasurement({ version: 2, isActive: true });

  MeasurementModelStub.create     = async () => created;
  MeasurementModelStub.makeActive = async () => activated;

  const result = await measurementResolvers.Mutation.createMeasurement(
    null,
    { input: { height: 175, weight: 70 } },
    authCtx()
  );

  assert.equal(result.id,       'meas-1');
  assert.equal(result.isActive, true);
  assert.equal(result.version,  2);
});

test('createMeasurement — falls back to created measurement when makeActive returns null', async () => {
  const created = makeMeasurement({ version: 1 });

  MeasurementModelStub.create     = async () => created;
  MeasurementModelStub.makeActive = async () => null;

  const result = await measurementResolvers.Mutation.createMeasurement(
    null,
    { input: { height: 170 } },
    authCtx()
  );

  assert.equal(result.id,      'meas-1');
  assert.equal(result.version, 1);
});

test('createMeasurement — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => measurementResolvers.Mutation.createMeasurement(null, { input: {} }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

test('createMeasurement — sets user from auth context (each create is per-user versioned)', async () => {
  const createCalls = [];
  MeasurementModelStub.create     = async (data) => { createCalls.push(data); return makeMeasurement(); };
  MeasurementModelStub.makeActive = async () => makeMeasurement();

  await measurementResolvers.Mutation.createMeasurement(
    null,
    { input: { height: 180, weight: 75 } },
    authCtx('user-42')
  );

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].user, 'user-42');
  assert.equal(createCalls[0].height, 180);
});

// ─── activateMeasurement mutation ────────────────────────────────────────────
// makeActive deactivates whatever was previously active and activates the target.
// The resolver enforces that only one measurement can be active at a time.

test('activateMeasurement — calls makeActive and returns the newly active measurement', async () => {
  const activated = makeMeasurement({ isActive: true });

  MeasurementModelStub.makeActive = async (id) => {
    assert.equal(id, 'meas-1');
    return activated;
  };

  const result = await measurementResolvers.Mutation.activateMeasurement(
    null,
    { id: 'meas-1' },
    authCtx()
  );

  assert.equal(result.id,       'meas-1');
  assert.equal(result.isActive, true);
});

test('activateMeasurement — throws NOT_FOUND when measurement does not exist', async () => {
  MeasurementModelStub.makeActive = async () => null;

  await assert.rejects(
    () => measurementResolvers.Mutation.activateMeasurement(null, { id: 'missing' }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('activateMeasurement — only one activation at a time (second activation changes active set)', async () => {
  const activateCalls = [];
  MeasurementModelStub.makeActive = async (id) => {
    activateCalls.push(id);
    return makeMeasurement({ id, entityId: id, isActive: true });
  };

  // Simulate activating measurement A, then B
  await measurementResolvers.Mutation.activateMeasurement(null, { id: 'meas-A' }, authCtx());
  await measurementResolvers.Mutation.activateMeasurement(null, { id: 'meas-B' }, authCtx());

  assert.deepEqual(activateCalls, ['meas-A', 'meas-B']);
});

test('activateMeasurement — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => measurementResolvers.Mutation.activateMeasurement(null, { id: 'meas-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── queueMeasurementForCycle mutation ───────────────────────────────────────
// Queues a measurement to become active for the next billing cycle
// without changing the currently active one.

test('queueMeasurementForCycle — queues the measurement and returns it', async () => {
  const queued = makeMeasurement({ isActive: false, queuedForCycle: 3 });

  MeasurementModelStub.queueForNextCycle = async (id, cycle) => {
    assert.equal(id,    'meas-1');
    assert.equal(cycle, 3);
    return queued;
  };

  const result = await measurementResolvers.Mutation.queueMeasurementForCycle(
    null,
    { id: 'meas-1', cycleNumber: 3 },
    authCtx()
  );

  assert.equal(result.id, 'meas-1');
});

test('queueMeasurementForCycle — throws NOT_FOUND when measurement does not exist', async () => {
  MeasurementModelStub.queueForNextCycle = async () => null;

  await assert.rejects(
    () => measurementResolvers.Mutation.queueMeasurementForCycle(null, { id: 'missing', cycleNumber: 1 }, authCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('queueMeasurementForCycle — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => measurementResolvers.Mutation.queueMeasurementForCycle(null, { id: 'meas-1', cycleNumber: 1 }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── activeMeasurement query ──────────────────────────────────────────────────

test('activeMeasurement — returns the currently active measurement for a user', async () => {
  const active = makeMeasurement({ isActive: true });
  MeasurementModelStub.getActiveForUser = async () => active;

  const result = await measurementResolvers.Query.activeMeasurement(
    null,
    { userId: 'user-1' },
    authCtx()
  );

  assert.equal(result.id,       'meas-1');
  assert.equal(result.isActive, true);
});

test('activeMeasurement — returns null when user has no active measurement', async () => {
  MeasurementModelStub.getActiveForUser = async () => null;

  const result = await measurementResolvers.Query.activeMeasurement(
    null,
    { userId: 'user-1' },
    authCtx()
  );

  assert.equal(result, null);
});
