import { getRedisClient } from '../../infrastructure/database/redis.js';

// Rating Entity class
class Model {
  // Check if rating is positive
  get isPositive() {
    return this.overallRating >= 4;
  }

  // Convert to safe JSON
  toSafeJSON() {
    return {
      id: this.entityId,
      tailor: this.tailor,
      job: this.job,
      qcReview: this.qcReview,
      ratedBy: this.ratedBy,
      craftsmanship: this.craftsmanship,
      accuracy: this.accuracy,
      timeliness: this.timeliness,
      communication: this.communication,
      overallRating: this.overallRating,
      comments: this.comments,
      internalNotes: this.internalNotes,
      impactsPerformance: this.impactsPerformance,
      ratedAt: this.ratedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isPositive: this.isPositive,
    };
  }
}

// Rating Schema for Redis OM
// Schema definition removed
// Repository holder
/**
 * Calculate overall rating from individual ratings
 */
const calculateOverallRating = (craftsmanship, accuracy, timeliness, communication) => {
  return (craftsmanship + accuracy + timeliness + communication) / 4;
};

// Static methods
const RatingModel = {
  /**
   * Create a new rating
   */
  async create(ratingData) {
    const repo = await getRatingRepository();

    const now = new Date();

    // Calculate overall rating
    const overallRating = calculateOverallRating(
      ratingData.craftsmanship,
      ratingData.accuracy,
      ratingData.timeliness,
      ratingData.communication
    );

    const rating = await repo.save({
      tailor: ratingData.tailor,
      job: ratingData.job,
      qcReview: ratingData.qcReview,
      ratedBy: ratingData.ratedBy,
      craftsmanship: ratingData.craftsmanship,
      accuracy: ratingData.accuracy,
      timeliness: ratingData.timeliness,
      communication: ratingData.communication,
      overallRating: ratingData.overallRating || overallRating,
      comments: ratingData.comments,
      internalNotes: ratingData.internalNotes,
      impactsPerformance: ratingData.impactsPerformance !== false,
      ratedAt: ratingData.ratedAt || now,
      createdAt: now,
      updatedAt: now,
    });

    return rating;
  },

  /**
   * Find rating by ID
   */
  async findById(id) {
    const repo = await getRatingRepository();
    const rating = await repo.fetch(id);
    if (!rating || !rating.tailor) return null;
    return rating;
  },

  /**
   * Find ratings by tailor
   */
  async findByTailor(tailorId) {
    const repo = await getRatingRepository();
    return repo.search()
      .where('tailor').equals(tailorId)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Calculate tailor average ratings
   */
  async calculateTailorAverage(tailorId) {
    const repo = await getRatingRepository();
    const ratings = await repo.search()
      .where('tailor').equals(tailorId)
      .return.all();

    // Filter for ratings that impact performance
    const performanceRatings = ratings.filter(r => r.impactsPerformance);

    if (performanceRatings.length === 0) {
      return {
        avgOverall: 0,
        avgCraftsmanship: 0,
        avgAccuracy: 0,
        avgTimeliness: 0,
        avgCommunication: 0,
        count: 0,
      };
    }

    const totals = performanceRatings.reduce(
      (acc, r) => {
        acc.overall += r.overallRating || 0;
        acc.craftsmanship += r.craftsmanship || 0;
        acc.accuracy += r.accuracy || 0;
        acc.timeliness += r.timeliness || 0;
        acc.communication += r.communication || 0;
        return acc;
      },
      { overall: 0, craftsmanship: 0, accuracy: 0, timeliness: 0, communication: 0 }
    );

    const count = performanceRatings.length;
    return {
      avgOverall: totals.overall / count,
      avgCraftsmanship: totals.craftsmanship / count,
      avgAccuracy: totals.accuracy / count,
      avgTimeliness: totals.timeliness / count,
      avgCommunication: totals.communication / count,
      count,
    };
  },

  /**
   * Update rating by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getRatingRepository();
    const rating = await repo.fetch(id);
    if (!rating || !rating.tailor) return null;

    // Recalculate overall rating if individual ratings changed
    const craftsmanship = updateData.craftsmanship ?? rating.craftsmanship;
    const accuracy = updateData.accuracy ?? rating.accuracy;
    const timeliness = updateData.timeliness ?? rating.timeliness;
    const communication = updateData.communication ?? rating.communication;

    if (updateData.craftsmanship !== undefined || updateData.accuracy !== undefined ||
        updateData.timeliness !== undefined || updateData.communication !== undefined) {
      updateData.overallRating = calculateOverallRating(craftsmanship, accuracy, timeliness, communication);
    }

    Object.assign(rating, updateData, { updatedAt: new Date() });
    await repo.save(rating);

    return options.new !== false ? rating : null;
  },

  /**
   * Find ratings with filters
   */
  async find(query = {}, options = {}) {
    const repo = await getRatingRepository();
    let search = repo.search();

    if (query.tailor) {
      search = search.where('tailor').equals(query.tailor);
    }
    if (query.ratedBy) {
      search = search.where('ratedBy').equals(query.ratedBy);
    }

    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    return search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);
  },

  /**
   * Count ratings
   */
  async countDocuments(query = {}) {
    const repo = await getRatingRepository();
    let search = repo.search();

    if (query.tailor) {
      search = search.where('tailor').equals(query.tailor);
    }
    if (query.ratedBy) {
      search = search.where('ratedBy').equals(query.ratedBy);
    }

    return search.return.count();
  },

  /**
   * Delete rating
   */
  async delete(id) {
    const repo = await getRatingRepository();
    await repo.remove(id);
  },
};

export default RatingModel;
