import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore } from '../../infrastructure/database/firebase.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';
import logger from '../../core/logger/index.js';

const COLLECTION = 'users';
const REDIS_SESSION_PREFIX = 'session:user:';
const SESSION_TTL = 86400 * 7; // 7 days in seconds

/**
 * User Model - Firestore with Redis session caching
 */
const UserModel = {
  /**
   * Create a new user
   */
  async create(userData) {
    const db = getFirestore();
    const userId = uuidv4();
    const now = new Date();

    const user = {
      id: userId,
      fullName: userData.fullName,
      email: userData.email?.toLowerCase(),
      phone: userData.phone,
      passwordHash: userData.passwordHash || null,
      activationCode: userData.activationCode || null, // Plain code for email
      isActivated: userData.isActivated || false,
      activatedAt: userData.activatedAt || null,
      dateOfBirth: userData.dateOfBirth || null,
      gender: userData.gender || null,
      height: userData.height || null,
      preferences: userData.preferences || null,
      profilePhoto: userData.profilePhoto || null,
      deliveryDetails: userData.deliveryDetails || null,
      paymentMethods: userData.paymentMethods || [],
      subscriptionStatus: userData.subscriptionStatus || 'inactive',
      currentSubscription: userData.currentSubscription || null,
      accountStatus: userData.accountStatus || 'pending',
      suspensionReason: userData.suspensionReason || null,
      onboardingCompleted: userData.onboardingCompleted || false,
      onboardingStep: userData.onboardingStep || 0,
      onboardingData: userData.onboardingData || null,
      birthdayPackageEligible: userData.birthdayPackageEligible || false,
      lastBirthdayPackage: userData.lastBirthdayPackage || null,
      lastLoginAt: userData.lastLoginAt || null,
      loginCount: userData.loginCount || 0,
      failedLoginAttempts: userData.failedLoginAttempts || 0,
      lockedUntil: userData.lockedUntil || null,
      lastPasswordReset: userData.lastPasswordReset || null,
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.collection(COLLECTION).doc(userId).set(user);
      logger.info(`User created: ${user.email} (${userId})`);
      return this.formatUser(user);
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  },


  /**
   * Find user by ID
   */
  async findById(id) {
    const db = getFirestore();

    try {
      const doc = await db.collection(COLLECTION).doc(id).get();
      if (!doc.exists) return null;
      return this.formatUser(doc.data());
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  },

  /**
   * Find user by email
   */
  async findByEmail(email) {
    const db = getFirestore();

    try {
      const snapshot = await db
        .collection(COLLECTION)
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();

      if (snapshot.empty) return null;
      return this.formatUser(snapshot.docs[0].data());
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  },

  /**
   * Find user by phone
   */
  async findByPhone(phone) {
    const db = getFirestore();

    try {
      const snapshot = await db
        .collection(COLLECTION)
        .where('phone', '==', phone)
        .limit(1)
        .get();

      if (snapshot.empty) return null;
      return this.formatUser(snapshot.docs[0].data());
    } catch (error) {
      logger.error('Error finding user by phone:', error);
      throw error;
    }
  },

  /**
   * Update user
   */
  async findByIdAndUpdate(id, updates) {
    const db = getFirestore();

    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      await db.collection(COLLECTION).doc(id).update(updateData);
      return this.findById(id);
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  },

  /**
   * Delete user (soft delete)
   */
  async delete(id) {
    const db = getFirestore();

    try {
      await db.collection(COLLECTION).doc(id).update({
        isDeleted: true,
        deletedAt: new Date(),
      });
      logger.info(`User soft-deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  },

  /**
   * Find all users with pagination
   */
  async find(filters = {}, pagination = {}) {
    const db = getFirestore();
    const { limit = 20, offset = 0 } = pagination;

    try {
      let query = db.collection(COLLECTION).where('isDeleted', '==', false);

      // Add filters
      if (filters.accountStatus) {
        query = query.where('accountStatus', '==', filters.accountStatus);
      }
      if (filters.subscriptionStatus) {
        query = query.where('subscriptionStatus', '==', filters.subscriptionStatus);
      }

      const snapshot = await query.limit(limit + 1).offset(offset).get();
      const users = snapshot.docs.map(doc => this.formatUser(doc.data()));
      
      return {
        users,
        hasMore: snapshot.docs.length > limit,
      };
    } catch (error) {
      logger.error('Error finding users:', error);
      throw error;
    }
  },

  /**
   * Count users
   */
  async countDocuments(filters = {}) {
    const db = getFirestore();

    try {
      let query = db.collection(COLLECTION).where('isDeleted', '==', false);

      if (filters.accountStatus) {
        query = query.where('accountStatus', '==', filters.accountStatus);
      }

      const snapshot = await query.count().get();
      return snapshot.data().count;
    } catch (error) {
      logger.error('Error counting users:', error);
      throw error;
    }
  },

  /**
   * Compare activation code (plain string comparison)
   */
  async compareActivationCode(user, code) {
    if (!user.activationCode) return false;
    return user.activationCode === code;
  },

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(user) {
    return this.findByIdAndUpdate(user.id, {
      failedLoginAttempts: (user.failedLoginAttempts || 0) + 1,
    });
  },

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(user) {
    return this.findByIdAndUpdate(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  },

  /**
   * Check if email exists
   */
  async emailExists(email) {
    const user = await this.findByEmail(email);
    return !!user;
  },

  /**
   * Check if phone exists
   */
  async phoneExists(phone) {
    const user = await this.findByPhone(phone);
    return !!user;
  },

  /**
   * Cache authenticated user in Redis
   */
  async cacheAuthenticatedUser(user) {
    try {
      const redis = getRedisClient();
      const key = `${REDIS_SESSION_PREFIX}${user.id}`;
      await redis.set(key, JSON.stringify(user), 'EX', SESSION_TTL);
      logger.info(`User cached in Redis: ${user.email}`);
    } catch (error) {
      logger.error('Error caching user in Redis:', error);
      // Don't throw - caching failure shouldn't break authentication
    }
  },

  /**
   * Get cached user from Redis
   */
  async getCachedUser(userId) {
    try {
      const redis = getRedisClient();
      const key = `${REDIS_SESSION_PREFIX}${userId}`;
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.error('Error getting cached user:', error);
      return null;
    }
  },

  /**
   * Clear cached user from Redis
   */
  async clearCachedUser(userId) {
    try {
      const redis = getRedisClient();
      const key = `${REDIS_SESSION_PREFIX}${userId}`;
      await redis.del(key);
      logger.info(`Cached user cleared: ${userId}`);
    } catch (error) {
      logger.error('Error clearing cached user:', error);
    }
  },

  /**
   * Format user for response
   */
  formatUser(user) {
    return {
      ...user,
      entityId: user.id, // For backward compatibility
      age: this.calculateAge(user.dateOfBirth),
      toSafeJSON: () => this.toSafeJSON(user),
    };
  },

  /**
   * Return user data without sensitive fields
   */
  toSafeJSON(user) {
    const safeUser = { ...user };
    delete safeUser.passwordHash;
    delete safeUser.activationCode;
    delete safeUser.failedLoginAttempts;
    delete safeUser.lockedUntil;
    return safeUser;
  },

  /**
   * Calculate age from date of birth
   */
  calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  },
};

export default UserModel;
