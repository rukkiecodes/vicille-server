/**
 * Unit tests — order resolvers + order status constants
 *
 * Covers (per plan section 6.3):
 *  - create order
 *  - transition map validation  (isValidTransition pure function + resolver)
 *  - cancellation lock after production start (cancelOrder enforcement)
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stub objects ─────────────────────────────────────────────────────

const OrderModelStub = {
  create:            async () => null,
  findById:          async () => null,
  findByIdFresh:     async () => null,
  findByIdAndUpdate: async () => null,
  findByOrderNumber: async () => null,
  find:              async () => ({ data: [], pagination: { total: 0 } }),
  findByStatus:      async () => [],
  updateStatus:      async () => null,
  cancelOrder:       async () => null,
};

const OrderItemModelStub = {
  create:      async () => null,
  findByOrder: async () => [],
  delete:      async () => {},
};

const UserModelStub = {
  findById:          async () => null,
  findDeliveryDetails: async () => null,
  findByIdAndUpdate: async () => {},
};

const JobModelStub  = { findByOrder: async () => [] };
const TailorModelStub = { findById: async () => null, findByIdAndUpdate: async () => {} };
const RatingModelStub = { create: async () => {}, calculateTailorAverage: async () => ({ avgOverall: 5 }) };

const dbTarget = { query: async () => ({ rows: [] }) };

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks (before resolver import) ────────────────────────────────────

await mock.module('cloudinary', {
  namedExports: { v2: { config: () => {}, uploader: { upload: () => {} } } },
});
await mock.module('../../src/modules/orders/order.model.js',       { defaultExport: OrderModelStub });
await mock.module('../../src/modules/orders/orderItem.model.js',   { defaultExport: OrderItemModelStub });
await mock.module('../../src/modules/users/user.model.js',         { defaultExport: UserModelStub });
await mock.module('../../src/modules/jobs/job.model.js',           { defaultExport: JobModelStub });
await mock.module('../../src/modules/tailors/tailor.model.js',     { defaultExport: TailorModelStub });
await mock.module('../../src/modules/ratings/rating.model.js',     { defaultExport: RatingModelStub });
await mock.module('../../src/infrastructure/database/postgres.js', { namedExports: { query: (...a) => dbTarget.query(...a) } });
await mock.module('../../src/core/logger/index.js',                { defaultExport: loggerStub });
await mock.module('../../src/config/cloudinary.js',                { namedExports: { cloudinaryConfig: {} } });

const { default: orderResolvers } = await import('../../src/graphql/resolvers/order.resolvers.js');
const { ORDER_STATUS, ORDER_STATUS_TRANSITIONS, isValidTransition, CANCELLABLE_STATUSES } =
  await import('../../src/core/constants/orderStatus.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authCtx  = (id = 'user-1', role = 'user') => ({ user: { id, role, type: role } });
const adminCtx = () => ({ user: { id: 'admin-1', role: 'admin', type: 'admin' } });
const tailorCtx = (id = 'tailor-1') => ({ user: { id, role: 'tailor', type: 'tailor' } });

function makeOrder(overrides = {}) {
  return {
    id:       'order-1',
    entityId: 'order-1',
    user:     'user-1',
    status:   ORDER_STATUS.STYLING_IN_PROGRESS,
    toSafeJSON() { return { id: this.id, status: this.status, user: this.user }; },
    ...overrides,
  };
}

// ─── isValidTransition (pure function — no mocks needed) ─────────────────────

test('isValidTransition — allows styling_in_progress → production_in_progress', () => {
  assert.equal(
    isValidTransition(ORDER_STATUS.STYLING_IN_PROGRESS, ORDER_STATUS.PRODUCTION_IN_PROGRESS),
    true
  );
});

test('isValidTransition — allows styling_in_progress → cancelled', () => {
  assert.equal(
    isValidTransition(ORDER_STATUS.STYLING_IN_PROGRESS, ORDER_STATUS.CANCELLED),
    true
  );
});

test('isValidTransition — blocks production_in_progress → cancelled (cancellation lock)', () => {
  assert.equal(
    isValidTransition(ORDER_STATUS.PRODUCTION_IN_PROGRESS, ORDER_STATUS.CANCELLED),
    false
  );
});

test('isValidTransition — blocks delivered → any further status', () => {
  const allStatuses = Object.values(ORDER_STATUS);
  for (const status of allStatuses) {
    assert.equal(
      isValidTransition(ORDER_STATUS.DELIVERED, status),
      false,
      `Expected delivered → ${status} to be invalid`
    );
  }
});

test('isValidTransition — blocks cancelled → any further status', () => {
  const allStatuses = Object.values(ORDER_STATUS);
  for (const status of allStatuses) {
    assert.equal(
      isValidTransition(ORDER_STATUS.CANCELLED, status),
      false,
      `Expected cancelled → ${status} to be invalid`
    );
  }
});

test('isValidTransition — full happy path: styling → production → package_ready → shipped → delivered', () => {
  const path = [
    ORDER_STATUS.STYLING_IN_PROGRESS,
    ORDER_STATUS.PRODUCTION_IN_PROGRESS,
    ORDER_STATUS.PACKAGE_READY_DELIVERY_IN_PROGRESS,
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.DELIVERED,
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.equal(
      isValidTransition(path[i], path[i + 1]),
      true,
      `Expected ${path[i]} → ${path[i + 1]} to be valid`
    );
  }
});

test('CANCELLABLE_STATUSES — only styling_in_progress can be cancelled', () => {
  assert.deepEqual(CANCELLABLE_STATUSES, [ORDER_STATUS.STYLING_IN_PROGRESS]);
});

// ─── createOrder mutation ─────────────────────────────────────────────────────

test('createOrder — creates and returns an order for the authenticated user', async () => {
  const order = makeOrder();
  UserModelStub.findById            = async () => ({ fullName: 'Ada Obi', email: 'ada@example.com', phone: '080' });
  UserModelStub.findDeliveryDetails = async () => null;
  OrderModelStub.create             = async () => order;

  const result = await orderResolvers.Mutation.createOrder(
    null,
    { input: { orderType: 'special_request' } },
    authCtx()
  );

  assert.equal(result.id,     'order-1');
  assert.equal(result.status, ORDER_STATUS.STYLING_IN_PROGRESS);
});

test('createOrder — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => orderResolvers.Mutation.createOrder(null, { input: {} }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── updateOrderStatus mutation ───────────────────────────────────────────────

test('updateOrderStatus — succeeds for a valid transition', async () => {
  const updated = makeOrder({ status: ORDER_STATUS.PRODUCTION_IN_PROGRESS });
  OrderModelStub.updateStatus = async () => updated;

  const result = await orderResolvers.Mutation.updateOrderStatus(
    null,
    { id: 'order-1', status: ORDER_STATUS.PRODUCTION_IN_PROGRESS },
    adminCtx()
  );

  assert.equal(result.status, ORDER_STATUS.PRODUCTION_IN_PROGRESS);
});

test('updateOrderStatus — wraps model error as BAD_USER_INPUT for invalid transition', async () => {
  OrderModelStub.updateStatus = async () => {
    throw new Error(`Cannot transition from ${ORDER_STATUS.DELIVERED} to ${ORDER_STATUS.CANCELLED}`);
  };

  await assert.rejects(
    () => orderResolvers.Mutation.updateOrderStatus(
      null,
      { id: 'order-1', status: ORDER_STATUS.CANCELLED },
      adminCtx()
    ),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('updateOrderStatus — throws FORBIDDEN when user tries to mark as DELIVERED', async () => {
  await assert.rejects(
    () => orderResolvers.Mutation.updateOrderStatus(
      null,
      { id: 'order-1', status: ORDER_STATUS.DELIVERED },
      authCtx('user-1', 'user')
    ),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('updateOrderStatus — allows tailor to mark as DELIVERED when assigned to order', async () => {
  const shipped = makeOrder({ status: ORDER_STATUS.SHIPPED, user: 'user-1' });
  const delivered = makeOrder({ status: ORDER_STATUS.DELIVERED });

  OrderModelStub.findByIdFresh = async () => shipped;
  JobModelStub.findByOrder     = async () => [{ tailor: 'tailor-1', id: 'job-1' }];
  OrderModelStub.updateStatus  = async () => delivered;

  const result = await orderResolvers.Mutation.updateOrderStatus(
    null,
    { id: 'order-1', status: ORDER_STATUS.DELIVERED },
    tailorCtx('tailor-1')
  );

  assert.equal(result.status, ORDER_STATUS.DELIVERED);
});

test('updateOrderStatus — throws FORBIDDEN when tailor is not assigned to the order', async () => {
  const shipped = makeOrder({ status: ORDER_STATUS.SHIPPED });

  OrderModelStub.findByIdFresh = async () => shipped;
  JobModelStub.findByOrder     = async () => [{ tailor: 'other-tailor', id: 'job-1' }];

  await assert.rejects(
    () => orderResolvers.Mutation.updateOrderStatus(
      null,
      { id: 'order-1', status: ORDER_STATUS.DELIVERED },
      tailorCtx('tailor-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── cancelOrder mutation ─────────────────────────────────────────────────────

test('cancelOrder — succeeds when order is in styling_in_progress', async () => {
  const cancelled = makeOrder({ status: ORDER_STATUS.CANCELLED });
  OrderModelStub.cancelOrder = async () => cancelled;

  const result = await orderResolvers.Mutation.cancelOrder(
    null,
    { id: 'order-1', reason: 'Changed my mind' },
    authCtx()
  );

  assert.equal(result.status, ORDER_STATUS.CANCELLED);
});

test('cancelOrder — throws BAD_USER_INPUT when order is past styling stage (cancellation lock)', async () => {
  OrderModelStub.cancelOrder = async () => {
    throw new Error('Order cannot be cancelled at this stage');
  };

  await assert.rejects(
    () => orderResolvers.Mutation.cancelOrder(null, { id: 'order-1', reason: 'x' }, authCtx()),
    (err) => {
      assert.equal(err.extensions?.code, 'BAD_USER_INPUT');
      assert.match(err.message, /cannot be cancelled/i);
      return true;
    }
  );
});

test('cancelOrder — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => orderResolvers.Mutation.cancelOrder(null, { id: 'order-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});
