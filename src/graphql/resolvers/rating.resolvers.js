import { GraphQLError } from 'graphql';
import RatingModel from '../../modules/ratings/rating.model.js';
import JobModel from '../../modules/jobs/job.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import { requireAuth, entityToJSON, entitiesToJSON } from '../helpers.js';
import { query } from '../../infrastructure/database/postgres.js';

const ratingResolvers = {
  Query: {
    myCompletedTailors: async (_, __, context) => {
      const authUser = requireAuth(context);

      // Find all jobs for this user that are completed/qc_approved
      const { rows: jobRows } = await query(
        `SELECT DISTINCT tailor_id FROM jobs
         WHERE user_id=$1 AND status IN ('completed','qc_approved') AND tailor_id IS NOT NULL`,
        [authUser.id]
      );

      if (!jobRows.length) return [];

      const results = await Promise.all(
        jobRows.map(async ({ tailor_id }) => {
          const tailor = await TailorModel.findById(tailor_id);
          if (!tailor) return null;

          // Count completed jobs this user had with this tailor
          const { rows: countRows } = await query(
            `SELECT COUNT(*) AS cnt FROM jobs
             WHERE user_id=$1 AND tailor_id=$2 AND status IN ('completed','qc_approved')`,
            [authUser.id, tailor_id]
          );
          const totalJobs = parseInt(countRows[0].cnt, 10);

          // Average rating this user gave this tailor
          const { rows: ratingRows } = await query(
            `SELECT AVG(overall_rating) AS avg FROM ratings WHERE rated_by=$1 AND tailor_id=$2`,
            [authUser.id, tailor_id]
          );
          const avgStars = parseFloat(ratingRows[0].avg || 0);

          return { tailor: entityToJSON(tailor), avgStars, totalJobs };
        })
      );

      return results
        .filter(Boolean)
        .sort((a, b) => b.avgStars - a.avgStars || b.totalJobs - a.totalJobs);
    },

    ratingForJob: async (_, { jobId }, context) => {
      const authUser = requireAuth(context);
      const { rows } = await query(
        'SELECT * FROM ratings WHERE job_id=$1 AND rated_by=$2 LIMIT 1',
        [jobId, authUser.id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id:        r.id,
        job:       r.job_id,
        tailor:    r.tailor_id,
        ratedBy:   r.rated_by,
        stars:     r.overall_rating,
        comment:   r.comments,
        createdAt: r.created_at,
      };
    },
  },

  Mutation: {
    submitUserRating: async (_, { jobId, tailorId, stars, comment }, context) => {
      const authUser = requireAuth(context);

      if (stars < 1 || stars > 5) {
        throw new GraphQLError('Stars must be between 1 and 5', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      // Verify job belongs to this user and is complete
      const job = await JobModel.findById(jobId);
      if (!job) {
        throw new GraphQLError('Job not found', { extensions: { code: 'NOT_FOUND' } });
      }
      if (job.user !== authUser.id) {
        throw new GraphQLError('This job does not belong to you', { extensions: { code: 'FORBIDDEN' } });
      }
      if (!['completed', 'qc_approved'].includes(job.status)) {
        throw new GraphQLError('Job must be completed before rating', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      // Prevent duplicate ratings for same job
      const { rows: existing } = await query(
        'SELECT id FROM ratings WHERE job_id=$1 AND rated_by=$2 LIMIT 1',
        [jobId, authUser.id]
      );
      if (existing.length) {
        throw new GraphQLError('You have already rated this job', { extensions: { code: 'CONFLICT' } });
      }

      // All sub-ratings = stars (simple model for user-facing rating)
      const rating = await RatingModel.create({
        tailor:           tailorId,
        job:              jobId,
        ratedBy:          authUser.id,
        craftsmanship:    stars,
        accuracy:         stars,
        timeliness:       stars,
        communication:    stars,
        overallRating:    stars,
        comments:         comment || null,
        impactsPerformance: true,
      });

      // Update tailor's average rating in their performance record
      const avg = await RatingModel.calculateTailorAverage(tailorId);
      await TailorModel.findByIdAndUpdate(tailorId, { averageRating: avg.avgOverall });

      return {
        id:        rating.id,
        job:       rating.job,
        tailor:    rating.tailor,
        ratedBy:   rating.ratedBy,
        stars:     rating.overallRating,
        comment:   rating.comments,
        createdAt: rating.createdAt,
      };
    },
  },
};

export default ratingResolvers;
