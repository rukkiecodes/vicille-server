/**
 * Public customer portal (batch 18). Token-only, read-only, NO auth, NO tenant id ever accepted.
 * Serves a minimal self-contained HTML page (Stitchd-styled, tailor-branded) and a pay-balance
 * redirect into the batch-09 Paystack collection. Mounted at /portal.
 */
import { Router } from 'express';
import StitchdPortalModel from '../modules/stitchd/stitchdPortal.model.js';
import logger from '../core/logger/index.js';

const router = Router();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString('en-NG')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function shell(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<style>
  :root{--p:#A37BFF;--pd:#7C53E6;--navy:#1E2A38;--text:#1A1A1A;--muted:#6B6B72;--bg:#FAFAFC;--surface:#fff;--border:#E5E5EA;--success:#34C759;--warn:#FF9F0A}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:24px}
  .wrap{max-width:480px;margin:0 auto}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:24px;margin-top:16px}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .logo{width:44px;height:44px;border-radius:12px;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;overflow:hidden}
  .logo img{width:100%;height:100%;object-fit:cover}
  .muted{color:var(--muted);font-size:14px}
  .pill{display:inline-block;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600;background:rgba(163,123,255,.12);color:var(--pd)}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)}
  .row:last-child{border-bottom:0}
  .amount{font-size:32px;font-weight:700;font-variant-numeric:tabular-nums}
  .btn{display:block;text-align:center;background:var(--p);color:#fff;font-weight:600;padding:16px;border-radius:12px;text-decoration:none;margin-top:18px}
  .foot{text-align:center;color:var(--muted);font-size:12px;margin-top:20px}
</style></head><body><div class="wrap">${inner}</div></body></html>`;
}

function brandHead(p) {
  const logo = p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="">` : esc((p.businessName || 'S')[0]);
  return `<div class="brand"><div class="logo">${logo}</div><div><strong>${esc(p.businessName)}</strong>${p.customerFirstName ? `<div class="muted">Hi ${esc(p.customerFirstName)} 👋</div>` : ''}</div></div>`;
}

function notFound(res) {
  return res.status(404).send(shell('Not found', `<div class="card"><h2>Link not available</h2><p class="muted" style="margin-top:8px">This link is invalid, has expired, or was turned off. Please ask your tailor for a new one.</p></div>`));
}

function tooMany(res) {
  return res.status(429).send(shell('Slow down', `<div class="card"><h2>Too many attempts</h2><p class="muted" style="margin-top:8px">Please wait a moment and try again.</p></div>`));
}

// Trusted client IP on Vercel (x-vercel-forwarded-for is set by the platform, not client-spoofable).
function clientIp(req) {
  return (
    req.headers['x-vercel-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip || 'unknown'
  );
}

// GET /portal/:token — the customer's read-only page.
router.get('/:token', async (req, res) => {
  try {
    // Generous per-IP cap — lets a real customer refresh freely, blunts scraping floods.
    if (!(await StitchdPortalModel.checkRate(`view:${clientIp(req)}`, 60, 60))) return tooMany(res);
    const p = await StitchdPortalModel.resolveToken(req.params.token);
    if (!p) return notFound(res);

    let body;
    if (p.scope === 'order' && p.order) {
      const o = p.order;
      const items = o.items.map((i) => `<div class="row"><span>${esc(i.garmentType)}${i.quantity > 1 ? ` ×${i.quantity}` : ''}</span></div>`).join('');
      const payable = o.balance > 0;
      body = `${brandHead(p)}
        <div class="card">
          <div class="row"><span class="muted">Order #${esc(String(o.orderNumber).padStart(3, '0'))}</span><span class="pill">${esc(o.status)}</span></div>
          ${o.dueDate ? `<div class="row"><span class="muted">Due</span><span>${esc(fmtDate(o.dueDate))}</span></div>` : ''}
          ${items}
        </div>
        <div class="card" style="text-align:center">
          <div class="muted">Balance due</div>
          <div class="amount" style="color:${payable ? 'var(--warn)' : 'var(--success)'}">${naira(o.balance)}</div>
          ${payable ? `<a class="btn" href="/portal/${esc(req.params.token)}/pay">Pay ${naira(o.balance)}</a>` : `<div class="muted" style="margin-top:8px">Fully paid — thank you! 🎉</div>`}
        </div>`;
    } else {
      const rows = (p.orders || []).map((o) => `<div class="row"><span>Order #${esc(String(o.orderNumber).padStart(3, '0'))} · ${esc(o.status)}</span><span>${naira(o.balance)}</span></div>`).join('') || '<p class="muted">No open orders.</p>';
      body = `${brandHead(p)}<div class="card"><div class="muted" style="margin-bottom:8px">Your open orders</div>${rows}</div>`;
    }
    res.set('Cache-Control', 'no-store').send(shell(p.businessName, body));
  } catch (err) {
    logger.error('[portal] view error:', err);
    notFound(res);
  }
});

// GET /portal/:token/pay — start a Paystack payment for the order's balance.
router.get('/:token/pay', async (req, res) => {
  try {
    // Strict caps on the costly path (each hit triggers a Paystack init): per-IP AND per-token.
    const ip = clientIp(req);
    if (!(await StitchdPortalModel.checkRate(`pay:${ip}`, 10, 600)) ||
        !(await StitchdPortalModel.checkRate(`pay:${req.params.token}`, 5, 600))) {
      return tooMany(res);
    }
    const result = await StitchdPortalModel.initPayment(req.params.token);
    if (result?.authUrl) return res.redirect(302, result.authUrl);
    return res.send(shell('Nothing to pay', `<div class="card"><h2>${esc(result?.message || 'Nothing to pay right now.')}</h2></div>`));
  } catch (err) {
    logger.error('[portal] pay error:', err);
    res.status(502).send(shell('Payment error', `<div class="card"><h2>Couldn’t start the payment</h2><p class="muted" style="margin-top:8px">Please try again, or contact your tailor.</p></div>`));
  }
});

export default router;
