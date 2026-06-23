/**
 * Deterministic measurement sanity rules (batch 19). Runs FREE and offline (mirrored client-side)
 * — the AI pass is an additive layer, not the primary gate. Rules WARN, never hard-block, so a
 * legitimately unusual body isn't refused (risk note §19). Field keys are matched leniently
 * (case-insensitive, ignoring spaces/underscores) against the batch-03 vocabulary.
 *
 * Returns [{ field, severity: 'warning'|'error', message }].
 */

// Plausible ranges per unit (generous; only flags clearly-impossible values).
const RANGES = {
  inch: { min: 1, max: 80 },
  cm: { min: 2, max: 220 },
};

// Ordered body girths that should generally increase down this list (warn if inverted).
const ORDER = ['neck', 'chest', 'bust', 'waist', 'hip'];

function norm(k) {
  return String(k || '').toLowerCase().replace(/[\s_-]/g, '');
}

function pick(fields, name) {
  const target = norm(name);
  for (const [k, v] of Object.entries(fields || {})) {
    if (norm(k) === target) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

export function validateMeasurements(fields = {}, unit = 'inch') {
  const issues = [];
  const range = RANGES[unit === 'cm' ? 'cm' : 'inch'];

  // 1) Out-of-range / non-positive values.
  for (const [k, v] of Object.entries(fields || {})) {
    const n = Number(v);
    if (v === '' || v == null) continue;
    if (!Number.isFinite(n)) { issues.push({ field: k, severity: 'warning', message: `${k} doesn't look like a number.` }); continue; }
    if (n <= 0) issues.push({ field: k, severity: 'error', message: `${k} must be greater than zero.` });
    else if (n < range.min || n > range.max) issues.push({ field: k, severity: 'warning', message: `${k} (${n}${unit === 'cm' ? 'cm' : '"'}) is outside the usual range — please double-check.` });
  }

  // 2) Girth ordering (e.g. neck > chest is almost always a typo).
  const present = ORDER.map((name) => ({ name, val: pick(fields, name) })).filter((x) => x.val != null);
  for (let i = 0; i < present.length - 1; i++) {
    const a = present[i], b = present[i + 1];
    if (a.val > b.val) {
      issues.push({ field: a.name, severity: 'warning', message: `${cap(a.name)} (${a.val}) is larger than ${b.name} (${b.val}) — is that right?` });
    }
  }

  // 3) Sleeve longer than full height-ish guard: sleeve vs shoulder sanity.
  const sleeve = pick(fields, 'sleeve') ?? pick(fields, 'sleevelength');
  const shoulder = pick(fields, 'shoulder');
  if (sleeve != null && shoulder != null && sleeve < shoulder) {
    issues.push({ field: 'sleeve', severity: 'warning', message: `Sleeve (${sleeve}) is shorter than shoulder (${shoulder}) — please check.` });
  }

  return issues;
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export default { validateMeasurements };
