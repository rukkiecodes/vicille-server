/**
 * Unit tests — rating resolvers (phase 7)
 *
 * Covers:
 *  - submitUserRating: star range validation, job ownership, completed-only guard,
 *                      duplicate prevention, tailor avg update
 *  - ratingForJob: returns own rating; returns null when none
 *  - myTailorReviews: tailor-only access, aggregates summary + reviews
 *  - myCompletedTailors: user query, sorted by avgStars → totalJobs
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stubs ────────────────────────────────────────────────────────────

const RatingModelStub = {
  create:                  async () => null,
  calculateTailorAverage:  async () => ({ avgOverall: 4.5 }),
};

const JobModelStub    = { findById: async () => null };
const TailorModelStub = { findById: async () => null, findByIdAndUpdate: async () => {} };

// query is called directly in the resolver — use a response queue so each call
// pops the next canned response in sequence.
const queryQueue = [];
const dbTarget   = { query: async () => queryQueue.shift() || { rows: [] } };

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks ─────────────────────────────────────────────────────────────

await mock.module('../../src/modules/ratings/rating.model.js',     { defaultExport: RatingModelStub });
await mock.module('../../src/modules/jobs/job.model.js',            { defaultExport: JobModelStub });
await mock.module('../../src/modules/tailors/tailor.model.js',      { defaultExport: TailorModelStub });
await mock.module('../../src/infrastructure/database/postgres.js',  {
  namedExports: { query: (...a) => dbTarget.query(...a) },
});
await mock.module('../../src/core/logger/index.js', { defaultExport: loggerStub });

const { default: ratingResolvers } = await import('../../src/graphql/resolvers/rating.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authCtx   = (id = 'user-1')   => ({ user: { id, role: 'user',   type: 'user'   } });
const tailorCtx = (id = 'tailor-1') => ({ user: { id, role: 'tailor', type: 'tailor' } });

function makeJob(overrides = {}) {
  return {
    id:     'job-1',
    user:   'user-1',
    tailor: 'tailor-1',
    status: 'qc_approved',
    ...overrides,
  };
}

function makeRating(overrides = {}) {
  return {
    id:            'rating-1',
    job:           'job-1',
    tailor:        'tailor-1',
    ratedBy:       'user-1',
    overallRating: 4,
    comments:      'Great work',
    createdAt:     new Date().toISOString(),
    ...overrides,
  };
}

// ─── submitUserRating ─────────────────────────────────────────────────────────

test('submitUserRating — creates rating and updates tailor average', async () => {
  const rating = makeRating();

  JobModelStub.findById               = async () => makeJob({ status: 'qc_approved', user: 'user-1' });
  RatingModelStub.create              = async () => rating;
  RatingModelStub.calculateTailorAverage = async () => ({ avgOverall: 4.5 });
  TailorModelStub.findByIdAndUpdate   = async () => {};

  // duplicate-check query returns no existing rating
  queryQueue.push({ rows: [] });

  const result = await ratingResolvers.Mutation.submitUserRating(
    null,
    { jobId: 'job-1', tailorId: 'tailor-1', stars: 4, comment: 'Great work' },
    authCtx('user-1')
  );

  assert.equal(result.stars, 4);
  assert.equal(result.comment, 'Great work');
});

test('submitUserRating — throws BAD_USER_INPUT when stars < 1', async () => {
  await assert.rejects(
    () => ratingResolvers.Mutation.submitUserRating(
      null, { jobId: 'job-1', tailorId: 'tailor-1', stars: 0, comment: null }, authCtx()
    ),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('submitUserRating — throws BAD_USER_INPUT when stars > 5', async () => {
  await assert.rejects(
    () => ratingResolvers.Mutation.submitUserRating(
      null, { jobId: 'job-1', tailorId: 'tailor-1', stars: 6, comment: null }, authCtx()
    ),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('submitUserRating — throws NOT_FOUND when job does not exist', async () => {
  JobModelStub.findById = async () => null;

  await assert.rejects(
    () => ratingResolvers.Mutation.submitUserRating(
      null, { jobId: 'missing', tailorId: 'tailor-1', stars: 5, comment: null }, authCtx()
    ),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('submitUserRating — throws FORBIDDEN when job does not belong to user', async () => {
  JobModelStub.findById = async () => makeJob({ user: 'other-user' });

  await assert.rejects(
    () => ratingResolvers.Mutation.submitUserRating(
      null, { jobId: 'job-1', tailorId: 'tailor-1', stars: 5, comment: null }, authCtx('user-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('submitUserRating — throws BAD_USER_INPUT when job is not completed', async () => {
  JobModelStub.findById = async () => makeJob({ status: 'in_progress', user: 'user-1' });

  await assert.rejects(
    () => ratingResolvers.Mutation.submitUserRating(
      null, { jobId: 'job-1', tailorId: 'tailor-1', stars: 5, comment: null }, authCtx('user-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'BAD_USER_INPUT'); return true; }
  );
});

test('submitUserRating — throws CONFLICT when user already rated this job', async () => {
  JobModelStub.findById = async () => makeJob({ user: 'user-1', status: 'qc_approved' });

  // duplicate-check query returns an existing rating
  queryQueue.push({ rows: [{ id: 'rating-old' }] });

  await assert.rejects(
    () => ratingResolvers.Mutation.submitUserRating(
      null, { jobId: 'job-1', tailorId: 'tailor-1', stars: 3, comment: null }, authCtx('user-1')
    ),
    (err) => { assert.equal(err.extensions?.code, 'CONFLICT'); return true; }
  );
});

test('submitUserRating — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => ratingResolvers.Mutation.submitUserRating(
      null, { jobId: 'job-1', tailorId: 'tailor-1', stars: 4, comment: null }, {}
    ),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── ratingForJob ─────────────────────────────────────────────────────────────

test('ratingForJob — returns the user\'s rating for the job', async () => {
  queryQueue.push({
    rows: [{
      id: 'rating-1', job_id: 'job-1', tailor_id: 'tailor-1',
      rated_by: 'user-1', overall_rating: 5, comments: 'Excellent',
      created_at: new Date().toISOString(),
    }],
  });

  const result = await ratingResolvers.Query.ratingForJob(null, { jobId: 'job-1' }, authCtx('user-1'));

  assert.equal(result.stars, 5);
  assert.equal(result.comment, 'Excellent');
});

test('ratingForJob — returns null when no rating exists for job', async () => {
  queryQueue.push({ rows: [] });

  const result = await ratingResolvers.Query.ratingForJob(null, { jobId: 'job-1' }, authCtx('user-1'));

  assert.equal(result, null);
});

test('ratingForJob — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => ratingResolvers.Query.ratingForJob(null, { jobId: 'job-1' }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── myTailorReviews ──────────────────────────────────────────────────────────

test('myTailorReviews — returns aggregated summary and individual reviews', async () => {
  // 1st query: summary (AVG + COUNT)
  queryQueue.push({ rows: [{ avg_stars: '4.2', total_ratings: '8' }] });
  // 2nd query: recent reviews
  queryQueue.push({
    rows: [
      { id: 'r-1', job_id: 'job-1', rated_by: 'user-1', overall_rating: '5', comments: 'Perfect', created_at: new Date().toISOString() },
      { id: 'r-2', job_id: 'job-2', rated_by: 'user-2', overall_rating: '3', comments: null,      created_at: new Date().toISOString() },
    ],
  });

  const result = await ratingResolvers.Query.myTailorReviews(null, { limit: 20 }, tailorCtx('tailor-1'));

  assert.ok(result.avgStars > 0, 'Expected avgStars > 0');
  assert.equal(result.totalRatings, 8);
  assert.equal(result.reviews.length, 2);
  assert.equal(result.reviews[0].stars, 5);
});

test('myTailorReviews — throws UNAUTHENTICATED when no tailor context', async () => {
  await assert.rejects(
    () => ratingResolvers.Query.myTailorReviews(null, { limit: 20 }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── myCompletedTailors ───────────────────────────────────────────────────────

test('myCompletedTailors — returns tailors sorted by avgStars then totalJobs', async () => {
  // Route queries by SQL content so concurrent Promise.all calls don't
  // race against a shared sequential queue.
  dbTarget.query = async (sql, params) => {
    if (sql.includes('DISTINCT tailor_id')) {
      return { rows: [{ tailor_id: 'tailor-1' }, { tailor_id: 'tailor-2' }] };
    }
    // COUNT query: params = [userId, tailorId]
    if (sql.includes('COUNT(*)') && params && params[1]) {
      return { rows: [{ cnt: params[1] === 'tailor-1' ? '3' : '5' }] };
    }
    // AVG query: params = [userId, tailorId]
    if (sql.includes('AVG(overall_rating)') && params && params[1]) {
      return { rows: [{ avg: params[1] === 'tailor-1' ? '4.8' : '3.2' }] };
    }
    return { rows: [] };
  };

  TailorModelStub.findById = async (id) => ({
    id, fullName: id === 'tailor-1' ? 'Ada Tailor' : 'Bob Tailor',
    toSafeJSON() { return { id, fullName: this.fullName }; },
  });

  const result = await ratingResolvers.Query.myCompletedTailors(null, {}, authCtx('user-1'));

  assert.equal(result.length, 2);
  // tailor-1 has higher avgStars (4.8 > 3.2) so should be first
  assert.equal(result[0].tailor.id, 'tailor-1');
  assert.equal(result[0].avgStars, 4.8);
  assert.equal(result[0].totalJobs, 3);

  // Restore queue-based stub for remaining tests
  dbTarget.query = async () => queryQueue.shift() || { rows: [] };
});

test('myCompletedTailors — returns empty array when user has no completed jobs', async () => {
  queryQueue.push({ rows: [] }); // no tailor rows

  const result = await ratingResolvers.Query.myCompletedTailors(null, {}, authCtx('user-1'));

  assert.deepEqual(result, []);
});

test('myCompletedTailors — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => ratingResolvers.Query.myCompletedTailors(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});
