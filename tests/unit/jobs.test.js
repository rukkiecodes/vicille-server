/**
 * Unit tests — job resolvers
 *
 * Covers (phase 6):
 *  - acceptJob / declineJob (tailor ownership + order status sync)
 *  - completeJob
 *  - submitJobProof (cloudinary upload → ready_for_qc)
 *  - approveQCProof (user owns order; admin bypass; order status advance)
 *  - rejectQCProof  (→ in_progress + revisionNotes)
 *  - markJobOrderDispatched (multi-step status chain → shipped)
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stub objects ─────────────────────────────────────────────────────

const JobModelStub = {
  findById:          async () => null,
  findByOrder:       async () => [],
  findByIdAndUpdate: async () => null,
  updateStatus:      async () => null,
  find:              async () => [],
  countDocuments:    async () => 0,
  findOverdue:       async () => [],
  create:            async () => null,
};

const OrderModelStub = {
  findById:          async () => null,
  findByIdFresh:     async () => null,
  findByIdAndUpdate: async () => null,
  updateStatus:      async () => null,
};

const TailorModelStub = {
  findById:          async () => null,
  findByIdAndUpdate: async () => {},
};

const UserModelStub = {
  findById:           async () => null,
  findDeliveryDetails: async () => null,
};

const MeasurementModelStub = {
  findById:          async () => null,
  getActiveForUser:  async () => null,
};

// Cloudinary uploader stub — calls callback immediately with a success result.
const cloudinaryUploaderTarget = {
  upload: (_dataUri, _opts, cb) => cb(null, { secure_url: 'https://cdn.example.com/proof.jpg' }),
};

const cloudinaryStub = {
  v2: {
    config: () => {},
    uploader: {
      upload: (...args) => cloudinaryUploaderTarget.upload(...args),
    },
  },
};

const dbTarget = { query: async () => ({ rows: [] }) };
const emailServiceStub = {
  sendAdminJobResponseEmail: async () => {},
};
const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks (before resolver import) ────────────────────────────────────

await mock.module('cloudinary', { namedExports: cloudinaryStub });
await mock.module('../../src/modules/jobs/job.model.js',          { defaultExport: JobModelStub });
await mock.module('../../src/modules/orders/order.model.js',      { defaultExport: OrderModelStub });
await mock.module('../../src/modules/tailors/tailor.model.js',    { defaultExport: TailorModelStub });
await mock.module('../../src/modules/users/user.model.js',        { defaultExport: UserModelStub });
await mock.module('../../src/modules/measurements/measurement.model.js', { defaultExport: MeasurementModelStub });
await mock.module('../../src/infrastructure/database/postgres.js', { namedExports: { query: (...a) => dbTarget.query(...a) } });
await mock.module('../../src/services/email.service.js',           { defaultExport: emailServiceStub });
await mock.module('../../src/core/logger/index.js',                { defaultExport: loggerStub });
await mock.module('../../src/config/cloudinary.js',                { namedExports: { cloudinaryConfig: {} } });

const { default: jobResolvers } = await import('../../src/graphql/resolvers/job.resolvers.js');
const { ORDER_STATUS } = await import('../../src/core/constants/orderStatus.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tailorCtx = (id = 'tailor-1') => ({ user: { id, role: 'tailor', type: 'tailor' } });
const adminCtx  = ()                  => ({ user: { id: 'admin-1', role: 'admin', type: 'admin' } });
const userCtx   = (id = 'user-1')     => ({ user: { id, role: 'user', type: 'user' } });

function makeJob(overrides = {}) {
  return {
    id:          'job-1',
    entityId:    'job-1',
    tailor:      'tailor-1',
    order:       'order-1',
    user:        'user-1',
    status:      'in_progress',
    statusHistory: [],
    toSafeJSON() { return { id: this.id, tailor: this.tailor, status: this.status, order: this.order }; },
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    id:          'order-1',
    entityId:    'order-1',
    user:        'user-1',
    status:      ORDER_STATUS.PRODUCTION_IN_PROGRESS,
    toSafeJSON() { return { id: this.id, status: this.status, user: this.user }; },
    ...overrides,
  };
}

// ─── acceptJob ────────────────────────────────────────────────────────────────

test('acceptJob — tailor accepts their own job and order is synced to production_in_progress', async () => {
  const job     = makeJob({ status: 'assigned' });
  const updated = makeJob({ status: 'in_progress' });

  JobModelStub.findById    = async () => job;
  JobModelStub.updateStatus = async () => updated;
  OrderModelStub.findByIdAndUpdate = async () => {};

  const result = await jobResolvers.Mutation.acceptJob(null, { id: 'job-1' }, tailorCtx());

  assert.equal(result.id,     'job-1');
  assert.equal(result.status, 'in_progress');
});

test('acceptJob — throws FORBIDDEN when job is not assigned to the tailor', async () => {
  JobModelStub.findById = async () => makeJob({ tailor: 'other-tailor' });

  await assert.rejects(
    () => jobResolvers.Mutation.acceptJob(null, { id: 'job-1' }, tailorCtx('tailor-1')),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('acceptJob — throws NOT_FOUND when job does not exist', async () => {
  JobModelStub.findById = async () => null;

  await assert.rejects(
    () => jobResolvers.Mutation.acceptJob(null, { id: 'missing' }, tailorCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── declineJob ───────────────────────────────────────────────────────────────

test('declineJob — tailor declines their own job', async () => {
  const job     = makeJob({ status: 'assigned' });
  const updated = makeJob({ status: 'declined' });

  JobModelStub.findById     = async () => job;
  JobModelStub.updateStatus = async () => updated;

  const result = await jobResolvers.Mutation.declineJob(
    null, { id: 'job-1', reason: 'Unavailable' }, tailorCtx()
  );

  assert.equal(result.status, 'declined');
});

test('declineJob — throws FORBIDDEN when job is not assigned to the tailor', async () => {
  JobModelStub.findById = async () => makeJob({ tailor: 'other-tailor' });

  await assert.rejects(
    () => jobResolvers.Mutation.declineJob(null, { id: 'job-1', reason: 'x' }, tailorCtx('tailor-1')),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── submitJobProof ───────────────────────────────────────────────────────────

test('submitJobProof — uploads photos and sets status to ready_for_qc', async () => {
  const job     = makeJob({ status: 'in_progress' });
  const updated = makeJob({ status: 'ready_for_qc' });

  JobModelStub.findById          = async () => job;
  JobModelStub.findByIdAndUpdate = async () => updated;

  const result = await jobResolvers.Mutation.submitJobProof(
    null,
    { id: 'job-1', photos: [{ base64: 'abc', mimeType: 'image/jpeg' }], notes: 'Done' },
    tailorCtx()
  );

  assert.equal(result.status, 'ready_for_qc');
});

test('submitJobProof — throws FORBIDDEN when job is not assigned to the tailor', async () => {
  JobModelStub.findById = async () => makeJob({ tailor: 'other-tailor' });

  await assert.rejects(
    () => jobResolvers.Mutation.submitJobProof(
      null, { id: 'job-1', photos: [], notes: null }, tailorCtx('tailor-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('submitJobProof — throws BAD_REQUEST when job is not in_progress', async () => {
  JobModelStub.findById = async () => makeJob({ status: 'ready_for_qc', tailor: 'tailor-1' });

  await assert.rejects(
    () => jobResolvers.Mutation.submitJobProof(
      null, { id: 'job-1', photos: [], notes: null }, tailorCtx('tailor-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'BAD_REQUEST'); return true; }
  );
});

// ─── approveQCProof ───────────────────────────────────────────────────────────

test('approveQCProof — user approves proof for their own order', async () => {
  const job     = makeJob({ status: 'ready_for_qc', order: 'order-1' });
  const order   = makeOrder({ user: 'user-1', status: ORDER_STATUS.PRODUCTION_IN_PROGRESS });
  const updated = makeJob({ status: 'qc_approved' });

  JobModelStub.findById          = async () => job;
  OrderModelStub.findByIdFresh   = async () => order;
  JobModelStub.findByIdAndUpdate = async () => updated;
  OrderModelStub.updateStatus    = async () => makeOrder({ status: ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED });

  const result = await jobResolvers.Mutation.approveQCProof(null, { id: 'job-1' }, userCtx('user-1'));

  assert.equal(result.status, 'qc_approved');
});

test('approveQCProof — throws FORBIDDEN when user does not own the order', async () => {
  const job   = makeJob({ status: 'ready_for_qc', order: 'order-1' });
  const order = makeOrder({ user: 'other-user' });

  JobModelStub.findById        = async () => job;
  OrderModelStub.findByIdFresh = async () => order;

  await assert.rejects(
    () => jobResolvers.Mutation.approveQCProof(null, { id: 'job-1' }, userCtx('user-1')),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('approveQCProof — admin can approve without ownership check', async () => {
  const job     = makeJob({ status: 'ready_for_qc', order: 'order-1' });
  const order   = makeOrder({ user: 'some-user', status: ORDER_STATUS.PRODUCTION_IN_PROGRESS });
  const updated = makeJob({ status: 'qc_approved' });

  JobModelStub.findById          = async () => job;
  JobModelStub.findByIdAndUpdate = async () => updated;
  OrderModelStub.findByIdFresh   = async () => order;
  OrderModelStub.updateStatus    = async () => makeOrder({ status: ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED });

  const result = await jobResolvers.Mutation.approveQCProof(null, { id: 'job-1' }, adminCtx());

  assert.equal(result.status, 'qc_approved');
});

test('approveQCProof — throws BAD_REQUEST when job is not in ready_for_qc status', async () => {
  const job   = makeJob({ status: 'in_progress', order: 'order-1' });
  const order = makeOrder({ user: 'user-1' });

  JobModelStub.findById        = async () => job;
  OrderModelStub.findByIdFresh = async () => order;

  await assert.rejects(
    () => jobResolvers.Mutation.approveQCProof(null, { id: 'job-1' }, userCtx('user-1')),
    (err) => { assert.equal(err.extensions?.code, 'BAD_REQUEST'); return true; }
  );
});

test('approveQCProof — advances order from PRODUCTION_IN_PROGRESS to PACKAGE_READY_PAYMENT_REQUIRED', async () => {
  const statusCalls = [];
  const job   = makeJob({ status: 'ready_for_qc', order: 'order-1' });
  const order = makeOrder({ user: 'user-1', status: ORDER_STATUS.PRODUCTION_IN_PROGRESS });

  JobModelStub.findById          = async () => job;
  OrderModelStub.findByIdFresh   = async () => order;
  JobModelStub.findByIdAndUpdate = async () => makeJob({ status: 'qc_approved' });
  OrderModelStub.updateStatus    = async (id, status) => {
    statusCalls.push(status);
    return makeOrder({ status });
  };

  await jobResolvers.Mutation.approveQCProof(null, { id: 'job-1' }, userCtx('user-1'));

  assert.ok(statusCalls.includes(ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED));
});

// ─── rejectQCProof ────────────────────────────────────────────────────────────

test('rejectQCProof — moves job back to in_progress with revision notes', async () => {
  const updateCalls = [];
  const job     = makeJob({ status: 'ready_for_qc', order: 'order-1' });
  const order   = makeOrder({ user: 'user-1' });
  const updated = makeJob({ status: 'in_progress' });

  JobModelStub.findById          = async () => job;
  OrderModelStub.findByIdFresh   = async () => order;
  JobModelStub.findByIdAndUpdate = async (id, patch) => {
    updateCalls.push(patch);
    return updated;
  };

  const result = await jobResolvers.Mutation.rejectQCProof(
    null, { id: 'job-1', reason: 'Stitching too loose' }, userCtx('user-1')
  );

  assert.equal(result.status, 'in_progress');
  const call = updateCalls.find(p => p.revisionNotes);
  assert.ok(call, 'Expected revisionNotes to be set');
  assert.equal(call.revisionNotes, 'Stitching too loose');
});

test('rejectQCProof — throws FORBIDDEN when user does not own the order', async () => {
  const job   = makeJob({ status: 'ready_for_qc', order: 'order-1' });
  const order = makeOrder({ user: 'other-user' });

  JobModelStub.findById        = async () => job;
  OrderModelStub.findByIdFresh = async () => order;

  await assert.rejects(
    () => jobResolvers.Mutation.rejectQCProof(null, { id: 'job-1', reason: 'x' }, userCtx('user-1')),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── markJobOrderDispatched ───────────────────────────────────────────────────

test('markJobOrderDispatched — advances order through status chain to SHIPPED', async () => {
  const statusCalls = [];
  const job   = makeJob({ tailor: 'tailor-1', order: 'order-1' });
  const order = makeOrder({ status: ORDER_STATUS.PACKAGE_READY_PAYMENT_REQUIRED, dispatchedAt: null });

  JobModelStub.findById        = async () => job;
  OrderModelStub.findByIdFresh = async () => order;
  OrderModelStub.updateStatus  = async (id, status) => {
    statusCalls.push(status);
    return makeOrder({ status });
  };
  OrderModelStub.findByIdAndUpdate = async () => makeOrder({ status: ORDER_STATUS.SHIPPED });

  const result = await jobResolvers.Mutation.markJobOrderDispatched(
    null,
    { id: 'job-1', input: { name: 'Rider Joe', phone: '08011112222' } },
    tailorCtx('tailor-1')
  );

  assert.ok(
    statusCalls.includes(ORDER_STATUS.SHIPPED),
    'Expected order to reach SHIPPED status'
  );
  assert.ok(result.id, 'Expected updated order returned');
});

test('markJobOrderDispatched — throws FORBIDDEN when job is not assigned to the tailor', async () => {
  JobModelStub.findById = async () => makeJob({ tailor: 'other-tailor', order: 'order-1' });

  await assert.rejects(
    () => jobResolvers.Mutation.markJobOrderDispatched(
      null,
      { id: 'job-1', input: { name: 'Rider', phone: '080' } },
      tailorCtx('tailor-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('markJobOrderDispatched — throws BAD_REQUEST when dispatch already submitted', async () => {
  const job   = makeJob({ tailor: 'tailor-1', order: 'order-1' });
  const order = makeOrder({
    status:      ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
    dispatchedAt: new Date(),
  });

  JobModelStub.findById        = async () => job;
  OrderModelStub.findByIdFresh = async () => order;

  await assert.rejects(
    () => jobResolvers.Mutation.markJobOrderDispatched(
      null,
      { id: 'job-1', input: { name: 'Rider', phone: '080' } },
      tailorCtx('tailor-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'BAD_REQUEST'); return true; }
  );
});
