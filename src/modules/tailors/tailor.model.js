import bcrypt from 'bcryptjs';
import { getRedisClient } from '../../infrastructure/database/redis.js';
import { hashPassword, comparePassword } from '../../core/utils/crypto.js';

// Tailor Entity class
class Model {
  // Get completion rate
  get completionRate() {
    const performance = this.performanceParsed;
    if (!performance || performance.totalJobsAssigned === 0) return 100;
    return Math.round((performance.totalJobsCompleted / performance.totalJobsAssigned) * 100);
  }

  // Check if verified
  get isVerified() {
    return this.verificationStatus === 'verified';
  }

  // Check if on probation
  get isOnProbation() {
    const performance = this.performanceParsed;
    return performance?.isProbation || false;
  }

  // Get parsed profile photo
  get profilePhotoParsed() {
    return this.profilePhoto ? JSON.parse(this.profilePhoto) : null;
  }

  // Get parsed specialties
  get specialtiesParsed() {
    return this.specialties ? JSON.parse(this.specialties) : [];
  }

  // Get parsed capacity
  get capacityParsed() {
    return this.capacity ? JSON.parse(this.capacity) : {
      preferredMaxPerDay: 3,
      preferredMaxPerWeek: 15,
      preferredMaxPerMonth: 50,
      currentCapacity: 10,
      isActive: true,
    };
  }

  // Get parsed performance
  get performanceParsed() {
    return this.performance ? JSON.parse(this.performance) : {
      totalJobsCompleted: 0,
      totalJobsAssigned: 0,
      onTimeDeliveryRate: 100,
      averageRating: 0,
      missedDeadlines: 0,
      consecutiveOnTimeJobs: 0,
      isProbation: true,
      probationJobsCompleted: 0,
    };
  }

  // Get parsed payment details
  get paymentDetailsParsed() {
    return this.paymentDetails ? JSON.parse(this.paymentDetails) : null;
  }

  // Get parsed KYC documents
  get kycDocumentsParsed() {
    return this.kycDocuments ? JSON.parse(this.kycDocuments) : [];
  }

  // Get parsed availability
  get availabilityParsed() {
    return this.availability ? JSON.parse(this.availability) : {
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      workingHours: { start: '08:00', end: '18:00' },
      isAvailable: true,
    };
  }

  // Check if can accept jobs
  canAcceptJobs() {
    const capacity = this.capacityParsed;
    const availability = this.availabilityParsed;
    return (
      this.accountStatus === 'active' &&
      this.verificationStatus === 'verified' &&
      capacity.isActive &&
      availability.isAvailable
    );
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      fullName: this.fullName,
      email: this.email,
      phone: this.phone,
      profilePhoto: this.profilePhotoParsed,
      verificationStatus: this.verificationStatus,
      verifiedAt: this.verifiedAt,
      specialties: this.specialtiesParsed,
      capacity: this.capacityParsed,
      performance: this.performanceParsed,
      paymentDetails: this.paymentDetailsParsed,
      kycDocuments: this.kycDocumentsParsed,
      availability: this.availabilityParsed,
      accountStatus: this.accountStatus,
      lastActiveAt: this.lastActiveAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completionRate: this.completionRate,
      isVerified: this.isVerified,
      isOnProbation: this.isOnProbation,
    };
  }
}

// Tailor Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const TailorModel = {
  /**
   * Create a new tailor
   */
  async create(tailorData) {
    const repo = await getTailorRepository();

    // Hash password
    if (tailorData.password) {
      tailorData.password = await hashPassword(tailorData.password);
    }

    const now = new Date();
    const defaultCapacity = {
      preferredMaxPerDay: 3,
      preferredMaxPerWeek: 15,
      preferredMaxPerMonth: 50,
      currentCapacity: 10,
      isActive: true,
    };
    const defaultPerformance = {
      totalJobsCompleted: 0,
      totalJobsAssigned: 0,
      onTimeDeliveryRate: 100,
      averageRating: 0,
      missedDeadlines: 0,
      consecutiveOnTimeJobs: 0,
      lastPerformanceReview: null,
      isProbation: true,
      probationJobsCompleted: 0,
    };
    const defaultAvailability = {
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      workingHours: { start: '08:00', end: '18:00' },
      isAvailable: true,
    };

    const tailor = await repo.save({
      fullName: tailorData.fullName,
      email: tailorData.email?.toLowerCase(),
      phone: tailorData.phone,
      password: tailorData.password,
      profilePhoto: tailorData.profilePhoto ? JSON.stringify(tailorData.profilePhoto) : null,
      verificationStatus: tailorData.verificationStatus || 'pending',
      verifiedBy: tailorData.verifiedBy,
      verifiedAt: tailorData.verifiedAt,
      skillTestDate: tailorData.skillTestDate,
      skillTestScore: tailorData.skillTestScore,
      skillTestNotes: tailorData.skillTestNotes,
      specialties: tailorData.specialties ? JSON.stringify(tailorData.specialties) : '[]',
      capacity: JSON.stringify(tailorData.capacity || defaultCapacity),
      performance: JSON.stringify(tailorData.performance || defaultPerformance),
      paymentDetails: tailorData.paymentDetails ? JSON.stringify(tailorData.paymentDetails) : null,
      kycDocuments: tailorData.kycDocuments ? JSON.stringify(tailorData.kycDocuments) : '[]',
      availability: JSON.stringify(tailorData.availability || defaultAvailability),
      accountStatus: tailorData.accountStatus || 'active',
      suspensionReason: tailorData.suspensionReason,
      suspendedUntil: tailorData.suspendedUntil,
      lastActiveAt: tailorData.lastActiveAt,
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return tailor;
  },

  /**
   * Find tailor by ID
   */
  async findById(id, options = {}) {
    const repo = await getTailorRepository();
    const tailor = await repo.fetch(id);
    if (!tailor || !tailor.email) return null;
    if (tailor.isDeleted && !options.includeDeleted) return null;
    return tailor;
  },

  /**
   * Find tailor by email
   */
  async findByEmail(email) {
    const repo = await getTailorRepository();
    const tailor = await repo.search()
      .where('email').equals(email.toLowerCase())
      .where('isDeleted').equals(false)
      .return.first();
    return tailor;
  },

  /**
   * Find tailor by email with password (for auth)
   */
  async findByEmailWithPassword(email) {
    return this.findByEmail(email);
  },

  /**
   * Find tailor by phone
   */
  async findByPhone(phone) {
    const repo = await getTailorRepository();
    const tailor = await repo.search()
      .where('phone').equals(phone)
      .where('isDeleted').equals(false)
      .return.first();
    return tailor;
  },

  /**
   * Update tailor by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getTailorRepository();
    const tailor = await repo.fetch(id);
    if (!tailor || !tailor.email) return null;
    if (tailor.isDeleted && !options.includeDeleted) return null;

    // Hash password if being updated
    if (updateData.password) {
      updateData.password = await hashPassword(updateData.password);
    }

    // Serialize complex objects
    const jsonFields = ['profilePhoto', 'specialties', 'capacity', 'performance', 'paymentDetails', 'kycDocuments', 'availability'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(tailor, updateData, { updatedAt: new Date() });
    await repo.save(tailor);

    return options.new !== false ? tailor : null;
  },

  /**
   * Delete tailor (soft delete)
   */
  async findByIdAndDelete(id) {
    const repo = await getTailorRepository();
    const tailor = await repo.fetch(id);
    if (!tailor || !tailor.email) return null;

    tailor.isDeleted = true;
    tailor.deletedAt = new Date();
    tailor.updatedAt = new Date();
    await repo.save(tailor);

    return tailor;
  },

  /**
   * Find all tailors with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getTailorRepository();
    let search = repo.search();

    // Default: exclude deleted
    if (query.includeDeleted !== true) {
      search = search.where('isDeleted').equals(false);
    }

    // Apply filters
    if (query.accountStatus) {
      search = search.where('accountStatus').equals(query.accountStatus);
    }
    if (query.verificationStatus) {
      search = search.where('verificationStatus').equals(query.verificationStatus);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const tailors = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return tailors;
  },

  /**
   * Find available tailors
   */
  async findAvailable() {
    const repo = await getTailorRepository();
    const tailors = await repo.search()
      .where('isDeleted').equals(false)
      .where('accountStatus').equals('active')
      .where('verificationStatus').equals('verified')
      .return.all();

    // Filter by capacity and availability (need to parse JSON)
    return tailors.filter(tailor => {
      const capacity = tailor.capacityParsed;
      const availability = tailor.availabilityParsed;
      return capacity.isActive && availability.isAvailable;
    });
  },

  /**
   * Find tailors by specialty
   */
  async findBySpecialty(category) {
    const repo = await getTailorRepository();
    const tailors = await repo.search()
      .where('isDeleted').equals(false)
      .where('accountStatus').equals('active')
      .where('verificationStatus').equals('verified')
      .return.all();

    // Filter by specialty (need to parse JSON)
    return tailors.filter(tailor => {
      const specialties = tailor.specialtiesParsed;
      return specialties.some(s => s.category === category);
    }).sort((a, b) => {
      const ratingA = a.performanceParsed?.averageRating || 0;
      const ratingB = b.performanceParsed?.averageRating || 0;
      return ratingB - ratingA;
    });
  },

  /**
   * Count tailors
   */
  async countDocuments(query = {}) {
    const repo = await getTailorRepository();
    let search = repo.search();

    if (query.includeDeleted !== true) {
      search = search.where('isDeleted').equals(false);
    }
    if (query.accountStatus) {
      search = search.where('accountStatus').equals(query.accountStatus);
    }
    if (query.verificationStatus) {
      search = search.where('verificationStatus').equals(query.verificationStatus);
    }

    return search.return.count();
  },

  /**
   * Compare password
   */
  async comparePassword(tailor, candidatePassword) {
    if (!tailor.password) return false;
    return comparePassword(candidatePassword, tailor.password);
  },

  /**
   * Update performance after job completion
   */
  async updatePerformanceOnCompletion(tailor, wasOnTime, rating) {
    const repo = await getTailorRepository();
    const performance = tailor.performanceParsed;

    performance.totalJobsCompleted += 1;

    if (wasOnTime) {
      performance.consecutiveOnTimeJobs += 1;
    } else {
      performance.missedDeadlines += 1;
      performance.consecutiveOnTimeJobs = 0;
    }

    // Recalculate on-time delivery rate
    const onTimeJobs = performance.totalJobsCompleted - performance.missedDeadlines;
    performance.onTimeDeliveryRate = Math.round(
      (onTimeJobs / performance.totalJobsCompleted) * 100
    );

    // Update average rating if provided
    if (rating) {
      const totalRatings = performance.totalJobsCompleted;
      performance.averageRating =
        (performance.averageRating * (totalRatings - 1) + rating) / totalRatings;
    }

    // Check probation completion
    if (performance.isProbation) {
      performance.probationJobsCompleted += 1;
      if (performance.probationJobsCompleted >= 5) {
        performance.isProbation = false;
      }
    }

    tailor.performance = JSON.stringify(performance);
    tailor.updatedAt = new Date();
    await repo.save(tailor);
  },

  /**
   * Check if email exists
   */
  async emailExists(email) {
    const tailor = await this.findByEmail(email);
    return !!tailor;
  },

  /**
   * Check if phone exists
   */
  async phoneExists(phone) {
    const tailor = await this.findByPhone(phone);
    return !!tailor;
  },
};

export default TailorModel;
