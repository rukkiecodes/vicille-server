import bcrypt from 'bcryptjs';
import { getRedisClient } from '../../infrastructure/database/redis.js';
import { hashActivationCode, compareActivationCode } from '../../core/utils/crypto.js';

/**
 * User Model - Redis-based persistence
 */
const UserModel = {
  prefix: 'user:',
  indexPrefix: 'user:index:',

  /**
   * Get fully qualified key for user
   */
  getKey(id) {
    return `${this.prefix}${id}`;
  },

  /**
   * Get index key
   */
  getIndexKey(field, value) {
    return `${this.indexPrefix}${field}:${value}`;
  },

  /**
   * Create a new user
   */
  async create(userData) {
    const client = getRedisClient();
    const { v4: uuidv4 } = await import('uuid');
    const userId = uuidv4();
    const key = this.getKey(userId);

    // Hash activation code if provided
    let activationCode = userData.activationCode;
    if (activationCode) {
      activationCode = await hashActivationCode(activationCode);
    }

    const now = new Date().toISOString();
    const user = {
      id: userId,
      fullName: userData.fullName,
      email: userData.email?.toLowerCase(),
      phone: userData.phone,
      passwordHash: userData.passwordHash || null,
      activationCode: activationCode || null,
      isActivated: userData.isActivated || false,
      activatedAt: userData.activatedAt || null,
      dateOfBirth: userData.dateOfBirth || null,
      gender: userData.gender || null,
      height: userData.height ? JSON.stringify(userData.height) : null,
      preferences: userData.preferences ? JSON.stringify(userData.preferences) : null,
      profilePhoto: userData.profilePhoto ? JSON.stringify(userData.profilePhoto) : null,
      deliveryDetails: userData.deliveryDetails ? JSON.stringify(userData.deliveryDetails) : null,
      paymentMethods: userData.paymentMethods ? JSON.stringify(userData.paymentMethods) : '[]',
      subscriptionStatus: userData.subscriptionStatus || 'inactive',
      currentSubscription: userData.currentSubscription || null,
      accountStatus: userData.accountStatus || 'pending',
      suspensionReason: userData.suspensionReason || null,
      onboardingCompleted: userData.onboardingCompleted || false,
      onboardingStep: userData.onboardingStep || 0,
      onboardingData: userData.onboardingData ? JSON.stringify(userData.onboardingData) : null,
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

    // Store user
    await client.set(key, JSON.stringify(user));

    // Create indexes
    if (user.email) {
      await client.set(this.getIndexKey('email', user.email), userId);
    }
    if (user.phone) {
      await client.set(this.getIndexKey('phone', user.phone), userId);
    }

    return this.formatUser(user);
  },

  /**
   * Find user by ID
   */
  async findById(id) {
    const client = getRedisClient();
    const key = this.getKey(id);
    const data = await client.get(key);

    if (!data) {
      return null;
    }

    const user = JSON.parse(data);
    if (user.isDeleted) {
      return null;
    }

    return this.formatUser(user);
  },

  /**
   * Find user by email
   */
  async findByEmail(email) {
    const client = getRedisClient();
    const indexKey = this.getIndexKey('email', email.toLowerCase());
    const userId = await client.get(indexKey);

    if (!userId) {
      return null;
    }

    return this.findById(userId);
  },

  /**
   * Find user by phone
   */
  async findByPhone(phone) {
    const client = getRedisClient();
    const indexKey = this.getIndexKey('phone', phone);
    const userId = await client.get(indexKey);

    if (!userId) {
      return null;
    }

    return this.findById(userId);
  },

  /**
   * Update user
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const client = getRedisClient();
    const key = this.getKey(id);
    const data = await client.get(key);

    if (!data) {
      return null;
    }

    const user = JSON.parse(data);

    if (user.isDeleted && !options.includeDeleted) {
      return null;
    }

    // Hash activation code if provided
    if (updateData.activationCode) {
      updateData.activationCode = await hashActivationCode(updateData.activationCode);
    }

    // Serialize complex objects
    const jsonFields = ['height', 'preferences', 'profilePhoto', 'deliveryDetails', 'paymentMethods', 'onboardingData'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update user
    const updated = {
      ...user,
      ...updateData,
      id: user.id,
      createdAt: user.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // Handle email index change
    if (updateData.email && updateData.email.toLowerCase() !== user.email) {
      if (user.email) {
        await client.del(this.getIndexKey('email', user.email));
      }
      await client.set(this.getIndexKey('email', updateData.email.toLowerCase()), id);
    }

    // Store updated user
    await client.set(key, JSON.stringify(updated));

    return options.new !== false ? this.formatUser(updated) : null;
  },

  /**
   * Soft delete user
   */
  async findByIdAndDelete(id) {
    const client = getRedisClient();
    const user = await this.findById(id);

    if (!user) {
      return null;
    }

    const key = this.getKey(id);
    const updated = {
      ...user,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await client.set(key, JSON.stringify(updated));
    return updated;
  },

  /**
   * Hard delete user
   */
  async hardDelete(id) {
    const client = getRedisClient();
    const user = await this.findById(id);

    if (!user) {
      return false;
    }

    // Delete indexes
    if (user.email) {
      await client.del(this.getIndexKey('email', user.email));
    }
    if (user.phone) {
      await client.del(this.getIndexKey('phone', user.phone));
    }

    // Delete user
    const key = this.getKey(id);
    const result = await client.del(key);
    return result > 0;
  },

  /**
   * Find all users (with pagination)
   */
  async find(query = {}, options = {}) {
    const client = getRedisClient();
    const pattern = `${this.prefix}*`;
    let cursor = '0';
    const users = [];

    do {
      const result = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: options.limit || 100,
      });

      for (const key of result.keys) {
        const data = await client.get(key);
        if (data) {
          const user = JSON.parse(data);

          // Apply filters
          if (query.includeDeleted !== true && user.isDeleted) continue;
          if (query.accountStatus && user.accountStatus !== query.accountStatus) continue;
          if (query.subscriptionStatus && user.subscriptionStatus !== query.subscriptionStatus) continue;
          if (query.isActivated !== undefined && user.isActivated !== query.isActivated) continue;
          if (query.onboardingCompleted !== undefined && user.onboardingCompleted !== query.onboardingCompleted) continue;

          users.push(this.formatUser(user));
        }
      }

      cursor = result.cursor;
    } while (cursor !== '0' && users.length < (options.limit || 100));

    return users.slice(0, options.limit || 100);
  },

  /**
   * Count users
   */
  async countDocuments(query = {}) {
    const client = getRedisClient();
    const pattern = `${this.prefix}*`;
    let cursor = '0';
    let count = 0;

    do {
      const result = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      for (const key of result.keys) {
        const data = await client.get(key);
        if (data) {
          const user = JSON.parse(data);

          if (query.includeDeleted !== true && user.isDeleted) continue;
          if (query.accountStatus && user.accountStatus !== query.accountStatus) continue;
          if (query.subscriptionStatus && user.subscriptionStatus !== query.subscriptionStatus) continue;

          count++;
        }
      }

      cursor = result.cursor;
    } while (cursor !== '0');

    return count;
  },

  /**
   * Compare activation code
   */
  async compareActivationCode(user, code) {
    if (!user.activationCode) return false;
    return compareActivationCode(code, user.activationCode);
  },

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(user) {
    const client = getRedisClient();
    const key = this.getKey(user.id);
    const updated = {
      ...user,
      failedLoginAttempts: (user.failedLoginAttempts || 0) + 1,
      updatedAt: new Date().toISOString(),
    };

    if (updated.failedLoginAttempts >= 5) {
      updated.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // Lock for 15 minutes
    }

    await client.set(key, JSON.stringify(updated));
    return this.formatUser(updated);
  },

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(user) {
    const client = getRedisClient();
    const key = this.getKey(user.id);
    const updated = {
      ...user,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
      loginCount: (user.loginCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    };

    await client.set(key, JSON.stringify(updated));
    return this.formatUser(updated);
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
   * Format user for response
   */
  formatUser(user) {
    return {
      ...user,
      heightParsed: user.height ? JSON.parse(user.height) : null,
      preferencesParsed: user.preferences ? JSON.parse(user.preferences) : null,
      profilePhotoParsed: user.profilePhoto ? JSON.parse(user.profilePhoto) : null,
      deliveryDetailsParsed: user.deliveryDetails ? JSON.parse(user.deliveryDetails) : null,
      paymentMethodsParsed: user.paymentMethods ? JSON.parse(user.paymentMethods) : [],
      age: this.calculateAge(user.dateOfBirth),
      isLocked: user.lockedUntil && new Date(user.lockedUntil) > new Date(),
    };
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
