/**
 * HTTP client for the vicelle-payments-service.
 * All methods throw on HTTP errors so callers can treat failures as exceptions.
 */

const BASE_URL = (process.env.PAYMENTS_SERVICE_URL || '').trim();
const SERVICE_KEY = (process.env.INTERNAL_SERVICE_KEY || '').trim();

async function req(method, path, body) {
  if (!BASE_URL) {
    throw new Error('PAYMENTS_SERVICE_URL is not configured');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-service-key': SERVICE_KEY,
    },
  };
  if (body !== undefined) {
    const payload = body && typeof body === 'object' ? { ...body, serviceKey: SERVICE_KEY } : body;
    options.body = JSON.stringify(payload);
  }

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || `Payments service error: ${method} ${path} → ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

const paymentsService = {
  // ── Customers ───────────────────────────────────────────────────────────────

  async ensureCustomer({ userId, email, firstName, lastName }) {
    return req('POST', '/customer/ensure', { userId, email, firstName, lastName });
    // Returns: { ok, customerCode, isNew }
  },

  // ── Subscription initialize ──────────────────────────────────────────────────

  async initializeSubscription({ email, userId, planId, subscriptionId, planCode, amountKobo, customerCode, fullName, planName }) {
    return req('POST', '/authorization/initialize', {
      email,
      userId,
      planId,
      subscriptionId,
      planCode,
      amountKobo,
      customerCode: customerCode || null,
      fullName: fullName || null,
      planName: planName || null,
    });
    // Returns: { ok, authorizationUrl, reference }
  },

  // ── Plans ────────────────────────────────────────────────────────────────────

  async createPlan({ name, amountKobo }) {
    return req('POST', '/plan', { name, amountKobo });
    // Returns: { ok, planCode, name, amountKobo }
  },

  async updatePlan(code, { name }) {
    return req('PUT', `/plan/${encodeURIComponent(code)}`, { name });
    // Returns: { ok, planCode, name }
  },

  // ── Subscription management ──────────────────────────────────────────────────

  async disableSubscription({ subscriptionCode, emailToken }) {
    return req('POST', '/subscription/disable', { subscriptionCode, emailToken });
    // Returns: { ok }
  },

  async enableSubscription({ subscriptionCode, emailToken }) {
    return req('POST', '/subscription/enable', { subscriptionCode, emailToken });
    // Returns: { ok }
  },

  async getSubscriptionManageLink(subscriptionCode) {
    return req('GET', `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`);
    // Returns: { ok, link }
  },

  async sendSubscriptionManageEmail(subscriptionCode) {
    return req('POST', `/subscription/${encodeURIComponent(subscriptionCode)}/manage/email`);
    // Returns: { ok }
  },

  // ── Wallet / DVA ─────────────────────────────────────────────────────────────

  async assignDva({ email, firstName, lastName, phone }) {
    return req('POST', '/wallet/dva/assign', { email, firstName, lastName, phone });
    // Returns: { ok, status: 'in_progress' }
  },

  async initializeTopUp({ email, userId, amountKobo, callbackUrl }) {
    return req('POST', '/wallet/topup/initialize', { email, userId, amountKobo, callbackUrl });
    // Returns: { ok, authorizationUrl, reference }
  },

  async chargeTopUp({ authorizationCode, email, userId, amountKobo }) {
    return req('POST', '/wallet/topup/charge', { authorizationCode, email, userId, amountKobo });
    // Returns: { ok, reference, status }
  },
};

export default paymentsService;
