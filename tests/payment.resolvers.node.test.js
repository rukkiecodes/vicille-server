import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYMENTS_SERVICE_URL = 'http://payments.test';
process.env.INTERNAL_SERVICE_KEY = 'svc-key';

const makeContext = (role = 'user', id = 'user-1') => ({
  user: { id, role, type: role },
});

test('myPayments calls payment service with user pagination and returns GraphQL connection shape', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options?.headers;

    return {
      ok: true,
      text: async () => JSON.stringify({
        data: [
          { id: 'pay-1', status: 'success' },
          { id: 'pay-2', status: 'pending' },
        ],
        pagination: {
          page: 2,
          limit: 2,
          total: 5,
          totalPages: 3,
        },
      }),
    };
  };

  const { default: paymentResolvers } = await import('../src/graphql/resolvers/payment.resolvers.js');
  const result = await paymentResolvers.Query.myPayments(
    null,
    { pagination: { page: 2, limit: 2 } },
    makeContext('user', 'user-42')
  );

  assert.equal(capturedUrl, 'http://payments.test/payment/list/user-42?page=2&limit=2');
  assert.equal(capturedHeaders['x-service-key'], 'svc-key');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');

  assert.equal(Array.isArray(result.nodes), true);
  assert.equal(result.nodes.length, 2);
  assert.deepEqual(result.pageInfo, {
    page: 2,
    limit: 2,
    total: 5,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true,
  });
});

test('payment query resolves by payment id endpoint', async () => {
  let capturedUrl = null;

  global.fetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      text: async () => JSON.stringify({ id: 'pay-123', status: 'success' }),
    };
  };

  const { default: paymentResolvers } = await import('../src/graphql/resolvers/payment.resolvers.js');
  const result = await paymentResolvers.Query.payment(
    null,
    { id: 'pay-123' },
    makeContext('user', 'user-42')
  );

  assert.equal(capturedUrl, 'http://payments.test/payment/id/pay-123');
  assert.equal(result.id, 'pay-123');
});

test('payments admin query calls global list endpoint and computes pageInfo flags', async () => {
  let capturedUrl = null;

  global.fetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      text: async () => JSON.stringify({
        data: [{ id: 'pay-1', status: 'refunded' }],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      }),
    };
  };

  const { default: paymentResolvers } = await import('../src/graphql/resolvers/payment.resolvers.js');
  const result = await paymentResolvers.Query.payments(
    null,
    { pagination: { page: 1, limit: 10 } },
    makeContext('admin', 'admin-1')
  );

  assert.equal(capturedUrl, 'http://payments.test/payment/list?page=1&limit=10');
  assert.deepEqual(result.pageInfo, {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
});

test('refundPayment uses admin guard and forwards reason payload', async () => {
  let capturedUrl = null;
  let capturedMethod = null;
  let capturedBody = null;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedMethod = options?.method;
    capturedBody = options?.body;

    return {
      ok: true,
      text: async () => JSON.stringify({ id: 'pay-11', status: 'refunded' }),
    };
  };

  const { default: paymentResolvers } = await import('../src/graphql/resolvers/payment.resolvers.js');
  const result = await paymentResolvers.Mutation.refundPayment(
    null,
    { id: 'pay-11', reason: 'customer_request' },
    makeContext('admin', 'admin-1')
  );

  assert.equal(capturedUrl, 'http://payments.test/payment/refund/pay-11');
  assert.equal(capturedMethod, 'POST');
  assert.equal(capturedBody, JSON.stringify({ reason: 'customer_request' }));
  assert.equal(result.status, 'refunded');
});

test('myPayments rejects unauthenticated requests', async () => {
  const { default: paymentResolvers } = await import('../src/graphql/resolvers/payment.resolvers.js');

  await assert.rejects(
    () => paymentResolvers.Query.myPayments(null, {}, {}),
    (error) => {
      assert.equal(error?.extensions?.code, 'UNAUTHENTICATED');
      assert.equal(error?.message, 'Authentication required');
      return true;
    }
  );
});

test('payments admin query rejects non-admin users', async () => {
  const { default: paymentResolvers } = await import('../src/graphql/resolvers/payment.resolvers.js');

  await assert.rejects(
    () => paymentResolvers.Query.payments(null, {}, makeContext('user', 'user-77')),
    (error) => {
      assert.equal(error?.extensions?.code, 'FORBIDDEN');
      assert.equal(error?.message, 'Insufficient permissions');
      return true;
    }
  );
});
