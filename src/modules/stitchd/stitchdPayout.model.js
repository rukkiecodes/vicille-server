/**
 * StitchdPayoutModel — weekly settlement of collected in-app payments to the tailor's bank
 * (batch 10). Consumes batch-09 `stitchd_payments` rows where settlement_status =
 * 'pending_payout' (and status='success'), holds them for a window, then aggregates and
 * transfers via Paystack (through the payments service).
 *
 * Tenant isolation (doc 01 §3): tailor-facing methods take `tailorId` first. The settlement
 * runner sweeps all tenants (cron) and scopes per tailor internally.
 *
 * Money safety: the cron is idempotent per (tailor, ISO-week period) via a unique index; a
 * payment can belong to only one payout (unique index on payout_items.payment_id); transfer
 * success/failure is reconciled from the Paystack webhook.
 */
import crypto from 'crypto';
import { GraphQLError } from 'graphql';
import { query, getClient } from '../../infrastructure/database/postgres.js';
import paymentsService from '../../services/paymentsService.js';
import logger from '../../core/logger/index.js';

const num = (v) => (v == null ? 0 : Number(v));

const HOLDING_HOURS = (() => {
  const v = parseInt(process.env.STITCHD_PAYOUT_HOLDING_HOURS || '48', 10);
  return Number.isFinite(v) && v >= 0 ? v : 48;
})();
const MIN_PAYOUT = (() => {
  const v = parseFloat(process.env.STITCHD_MIN_PAYOUT_NGN || '1000');
  return Number.isFinite(v) && v >= 0 ? v : 1000;
})();
const PAYOUT_HOUR_UTC = 9; // Monday 09:00 UTC ≈ 10:00 WAT

// ── Week / schedule helpers (UTC) ──────────────────────────────────────────────

/** Monday 00:00 UTC of the ISO week containing `d`. */
function weekStartUTC(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

/** Next Monday `PAYOUT_HOUR_UTC`:00 UTC at or after `from`. */
function nextPayoutDate(from = new Date()) {
  const monday = weekStartUTC(from);
  const sched = new Date(monday.getTime());
  sched.setUTCHours(PAYOUT_HOUR_UTC, 0, 0, 0);
  if (sched.getTime() <= from.getTime()) {
    sched.setUTCDate(sched.getUTCDate() + 7); // already past this week's run
  }
  return sched;
}

function bankSnapshot(b) {
  if (!b) return null;
  return {
    id:                   b.id,
    bankCode:             b.bank_code,
    bankName:             b.bank_name || null,
    accountNumber:        b.account_number,
    accountName:          b.account_name || null,
    paystackRecipientCode: b.paystack_recipient_code || null,
    isDefault:            b.is_default,
    verifiedAt:           b.verified_at || null,
  };
}

function formatPayout(row, items = []) {
  if (!row) return null;
  return {
    id:            row.id,
    periodStart:   row.period_start,
    periodEnd:     row.period_end,
    scheduledFor:  row.scheduled_for,
    status:        row.status,
    grossAmount:   num(row.gross_amount),
    feeTotal:      num(row.fee_total),
    netAmount:     num(row.net_amount),
    currency:      row.currency,
    provider:      row.provider,
    bankAccount:   row.bank_account_snapshot || null,
    failureReason: row.failure_reason || null,
    createdAt:     row.created_at,
    settledAt:     row.settled_at || null,
    items:         items.map((i) => ({
      id: i.id, paymentId: i.payment_id, orderId: i.order_id || null,
      orderNumber: i.order_number != null ? Number(i.order_number) : null,
      gross: num(i.gross), fee: num(i.fee), net: num(i.net),
    })),
  };
}

const StitchdPayoutModel = {
  HOLDING_HOURS,
  MIN_PAYOUT,
  nextPayoutDate,

  // ── Bank account ─────────────────────────────────────────────────────────────

  async listBanks() {
    const resp = await paymentsService.listBanks();
    return (resp.banks || []).map((b) => ({ name: b.name, code: b.code }));
  },

  async getBankAccount(tailorId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_payout_bank_accounts WHERE tailor_id=$1 AND is_default=TRUE LIMIT 1',
      [tailorId]
    );
    return bankSnapshot(rows[0]);
  },

  /**
   * Resolve + verify a bank account, create a Paystack transfer recipient, and store it as
   * the tailor's default. Re-running replaces the default (new recipient).
   */
  async setBankAccount(tailorId, { bankCode, accountNumber }) {
    if (!bankCode || !accountNumber) {
      throw new GraphQLError('Bank and account number are required.', { extensions: { code: 'BAD_USER_INPUT' } });
    }

    let accountName;
    let recipientCode;
    try {
      const resolved = await paymentsService.resolveBank({ accountNumber, bankCode });
      accountName = resolved.accountName;
      if (!accountName) throw new Error('Account could not be resolved');
      const recip = await paymentsService.createTransferRecipient({ name: accountName, accountNumber, bankCode });
      recipientCode = recip.recipientCode;
    } catch (e) {
      logger.error('setBankAccount resolve/recipient error:', e.message);
      throw new GraphQLError('We could not verify that account. Check the number and bank and try again.', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      // Demote any existing default, then upsert this account as the default.
      await client.query('UPDATE stitchd_payout_bank_accounts SET is_default=FALSE, updated_at=now() WHERE tailor_id=$1', [tailorId]);
      const { rows } = await client.query(
        `INSERT INTO stitchd_payout_bank_accounts
           (tailor_id, bank_code, bank_name, account_number, account_name, paystack_recipient_code, is_default, verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE, now())
         RETURNING *`,
        [tailorId, bankCode, null, accountNumber, accountName, recipientCode]
      );
      await client.query('COMMIT');
      return bankSnapshot(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  // ── Pending balance + history (tailor-facing) ────────────────────────────────

  /** Collected-but-unsettled net total, plus what's eligible now and the next run date. */
  async pending(tailorId) {
    const cutoff = new Date(Date.now() - HOLDING_HOURS * 3600_000);
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(net_amount), 0) AS pending_total,
         COALESCE(SUM(net_amount) FILTER (WHERE paid_on <= $2), 0) AS eligible_total
       FROM stitchd_payments
       WHERE tailor_id=$1 AND type='in_app_collected' AND status='success'
         AND settlement_status='pending_payout'`,
      [tailorId, cutoff]
    );
    return {
      pendingBalance:    num(rows[0]?.pending_total),
      nextPayoutEstimate: num(rows[0]?.eligible_total),
      nextPayoutDate:    nextPayoutDate().toISOString(),
      currency:          'NGN',
    };
  },

  async list(tailorId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_payouts WHERE tailor_id=$1 ORDER BY scheduled_for DESC, created_at DESC',
      [tailorId]
    );
    return rows.map((r) => formatPayout(r));
  },

  async findById(tailorId, id) {
    const { rows } = await query('SELECT * FROM stitchd_payouts WHERE tailor_id=$1 AND id=$2', [tailorId, id]);
    if (!rows[0]) return null;
    const { rows: items } = await query(
      `SELECT i.*, o.order_number
         FROM stitchd_payout_items i
         LEFT JOIN stitchd_orders o ON o.id = i.order_id
        WHERE i.payout_id=$1 ORDER BY i.created_at ASC`,
      [id]
    );
    return formatPayout(rows[0], items);
  },

  // ── Settlement runner (cron) ─────────────────────────────────────────────────

  /**
   * Settle all eligible tenants for the current ISO week. Idempotent per (tailor, week).
   * Returns a summary array. Each tenant: aggregate eligible pending payments past the
   * holding window, create a payout + items, initiate a Paystack transfer (status →
   * 'processing'); the transfer webhook later flips to 'paid'/'failed'.
   */
  async runSettlement(now = new Date()) {
    const periodStart = weekStartUTC(now);
    const periodEnd = new Date(periodStart.getTime() + 7 * 86400000);
    const scheduledFor = new Date(periodStart.getTime()); scheduledFor.setUTCHours(PAYOUT_HOUR_UTC, 0, 0, 0);
    const cutoff = new Date(now.getTime() - HOLDING_HOURS * 3600_000);
    const results = [];

    // Tenants with eligible pending payments AND a default verified bank with a recipient.
    const { rows: tenants } = await query(
      `SELECT DISTINCT p.tailor_id
         FROM stitchd_payments p
         JOIN stitchd_payout_bank_accounts b
           ON b.tailor_id = p.tailor_id AND b.is_default AND b.paystack_recipient_code IS NOT NULL
        WHERE p.type='in_app_collected' AND p.status='success'
          AND p.settlement_status='pending_payout' AND p.paid_on <= $1`,
      [cutoff]
    );

    for (const t of tenants) {
      const tailorId = t.tailor_id;
      try {
        const r = await this.settleTenant(tailorId, { periodStart, periodEnd, scheduledFor, cutoff });
        results.push({ tailorId, ...r });
      } catch (e) {
        logger.error('[payout] settleTenant error', { tailorId, error: e.message });
        results.push({ tailorId, skipped: 'error', error: e.message });
      }
    }
    return results;
  },

  /** Settle one tenant for the given period (idempotent on the unique period index). */
  async settleTenant(tailorId, { periodStart, periodEnd, scheduledFor, cutoff }) {
    const bank = await this.getBankAccount(tailorId);
    if (!bank?.paystackRecipientCode) return { skipped: 'no_bank' };

    const client = await getClient();
    let payoutId = null;
    let net = 0;
    try {
      await client.query('BEGIN');

      // Idempotent: one payout per tenant per week. SKIP LOCKED guards concurrent runs.
      const { rows: existing } = await client.query(
        'SELECT id, status FROM stitchd_payouts WHERE tailor_id=$1 AND period_start=$2 AND period_end=$3',
        [tailorId, periodStart, periodEnd]
      );
      if (existing[0]) { await client.query('ROLLBACK'); return { skipped: 'already_run', payoutId: existing[0].id }; }

      // Lock the eligible payments so a concurrent run can't grab them too.
      const { rows: eligible } = await client.query(
        `SELECT id, order_id, amount, fee_amount, net_amount
           FROM stitchd_payments
          WHERE tailor_id=$1 AND type='in_app_collected' AND status='success'
            AND settlement_status='pending_payout' AND paid_on <= $2
          ORDER BY paid_on ASC
          FOR UPDATE SKIP LOCKED`,
        [tailorId, cutoff]
      );
      if (!eligible.length) { await client.query('ROLLBACK'); return { skipped: 'nothing_eligible' }; }

      const gross = eligible.reduce((s, p) => s + num(p.amount), 0);
      const fee = eligible.reduce((s, p) => s + num(p.fee_amount), 0);
      net = eligible.reduce((s, p) => s + num(p.net_amount), 0);

      if (net < MIN_PAYOUT) { await client.query('ROLLBACK'); return { skipped: 'below_minimum', net }; }

      const { rows: pRows } = await client.query(
        `INSERT INTO stitchd_payouts
           (tailor_id, period_start, period_end, scheduled_for, status,
            gross_amount, fee_total, net_amount, currency, provider, bank_account_snapshot)
         VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,'NGN','paystack',$8::jsonb)
         RETURNING *`,
        [tailorId, periodStart, periodEnd, scheduledFor, gross, fee, net, JSON.stringify(bank)]
      );
      payoutId = pRows[0].id;

      for (const p of eligible) {
        await client.query(
          `INSERT INTO stitchd_payout_items (payout_id, payment_id, order_id, gross, fee, net)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [payoutId, p.id, p.order_id || null, num(p.amount), num(p.fee_amount), num(p.net_amount)]
        );
        await client.query('UPDATE stitchd_payments SET payout_id=$1, updated_at=now() WHERE id=$2', [payoutId, p.id]);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // Initiate the transfer outside the txn; reconcile via webhook.
    const reference = `STP-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      const resp = await paymentsService.initiateTransfer({
        amountKobo: Math.round(net * 100),
        recipientCode: bank.paystackRecipientCode,
        reason: 'Stitchd weekly payout',
        reference,
      });
      await query(
        `UPDATE stitchd_payouts SET status='processing', provider_transfer_ref=$1 WHERE id=$2`,
        [resp.reference || reference, payoutId]
      );
      return { payoutId, net, status: 'processing' };
    } catch (e) {
      logger.error('[payout] transfer initiate failed', { tailorId, payoutId, error: e.message });
      // Roll the payout back to failed and release its payments for the next run.
      await this.markPayoutFailed({ payoutId, reason: String(e.message).slice(0, 300) });
      return { payoutId, net, status: 'failed', error: e.message };
    }
  },

  // ── Webhook reconciliation (internal route) ──────────────────────────────────

  /** Transfer succeeded: finalise payout + flip member payments to paid_out. Idempotent. */
  async markPayoutPaid({ providerTransferRef }) {
    if (!providerTransferRef) return null;
    const { rows } = await query('SELECT * FROM stitchd_payouts WHERE provider_transfer_ref=$1', [providerTransferRef]);
    const payout = rows[0];
    if (!payout || payout.status === 'paid') return payout ? formatPayout(payout) : null;

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE stitchd_payouts SET status='paid', settled_at=now() WHERE id=$1`, [payout.id]);
      await client.query(
        `UPDATE stitchd_payments SET settlement_status='paid_out', settled_at=now(), updated_at=now()
          WHERE payout_id=$1`,
        [payout.id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return this.findById(payout.tailor_id, payout.id);
  },

  /**
   * Transfer failed (webhook or initiate error): mark payout failed and RELEASE its payments
   * (clear payout_id, delete items) so the next weekly run re-picks them. Idempotent.
   */
  async markPayoutFailed({ providerTransferRef = null, payoutId = null, reason = null }) {
    const { rows } = providerTransferRef
      ? await query('SELECT * FROM stitchd_payouts WHERE provider_transfer_ref=$1', [providerTransferRef])
      : await query('SELECT * FROM stitchd_payouts WHERE id=$1', [payoutId]);
    const payout = rows[0];
    if (!payout || payout.status === 'paid' || payout.status === 'failed') {
      return payout ? formatPayout(payout) : null;
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE stitchd_payments SET payout_id=NULL, updated_at=now() WHERE payout_id=$1', [payout.id]);
      await client.query('DELETE FROM stitchd_payout_items WHERE payout_id=$1', [payout.id]);
      await client.query(`UPDATE stitchd_payouts SET status='failed', failure_reason=$1 WHERE id=$2`, [reason ? String(reason).slice(0, 300) : 'transfer_failed', payout.id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return formatPayout({ ...payout, status: 'failed', failure_reason: reason });
  },
};

export default StitchdPayoutModel;
