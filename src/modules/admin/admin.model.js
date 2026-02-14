import { getRedisClient } from '../../infrastructure/database/redis.js';
import { hashPassword, comparePassword } from '../../core/utils/crypto.js';

// Admin Entity class
class Model {
  // Check if super admin
  get isSuperAdmin() {
    return this.role === 'super_admin';
  }

  // Get parsed profile photo
  get profilePhotoParsed() {
    return this.profilePhoto ? JSON.parse(this.profilePhoto) : null;
  }

  // Get parsed permissions
  get permissionsParsed() {
    return this.permissions ? JSON.parse(this.permissions) : [];
  }

  // Check if has specific permission
  hasPermission(permission) {
    if (this.role === 'super_admin') return true;
    const perms = this.permissionsParsed;
    return perms.includes(permission);
  }

  // Check if has any of the permissions
  hasAnyPermission(permissions) {
    if (this.role === 'super_admin') return true;
    const perms = this.permissionsParsed;
    return permissions.some(p => perms.includes(p));
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      fullName: this.fullName,
      email: this.email,
      phone: this.phone,
      role: this.role,
      permissions: this.permissionsParsed,
      profilePhoto: this.profilePhotoParsed,
      accountStatus: this.accountStatus,
      createdBy: this.createdBy,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isSuperAdmin: this.isSuperAdmin,
    };
  }
}

// Admin Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const AdminModel = {
  /**
   * Create a new admin
   */
  async create(adminData) {
    const repo = await getAdminRepository();

    // Hash password
    if (adminData.password) {
      adminData.password = await hashPassword(adminData.password);
    }

    const now = new Date();
    const admin = await repo.save({
      fullName: adminData.fullName,
      email: adminData.email?.toLowerCase(),
      phone: adminData.phone,
      password: adminData.password,
      role: adminData.role || 'admin',
      permissions: adminData.permissions ? JSON.stringify(adminData.permissions) : '[]',
      profilePhoto: adminData.profilePhoto ? JSON.stringify(adminData.profilePhoto) : null,
      accountStatus: adminData.accountStatus || 'active',
      createdBy: adminData.createdBy,
      lastLoginAt: adminData.lastLoginAt,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    return admin;
  },

  /**
   * Find admin by ID
   */
  async findById(id, options = {}) {
    const repo = await getAdminRepository();
    const admin = await repo.fetch(id);
    if (!admin || !admin.email) return null;
    if (admin.isDeleted && !options.includeDeleted) return null;
    return admin;
  },

  /**
   * Find admin by email
   */
  async findByEmail(email) {
    const repo = await getAdminRepository();
    const admin = await repo.search()
      .where('email').equals(email.toLowerCase())
      .where('isDeleted').equals(false)
      .return.first();
    return admin;
  },

  /**
   * Find admin by email with password (for auth)
   */
  async findByEmailWithPassword(email) {
    return this.findByEmail(email);
  },

  /**
   * Update admin by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getAdminRepository();
    const admin = await repo.fetch(id);
    if (!admin || !admin.email) return null;
    if (admin.isDeleted && !options.includeDeleted) return null;

    // Hash password if being updated
    if (updateData.password) {
      updateData.password = await hashPassword(updateData.password);
    }

    // Serialize complex objects
    if (updateData.permissions && Array.isArray(updateData.permissions)) {
      updateData.permissions = JSON.stringify(updateData.permissions);
    }
    if (updateData.profilePhoto && typeof updateData.profilePhoto === 'object') {
      updateData.profilePhoto = JSON.stringify(updateData.profilePhoto);
    }

    // Update fields
    Object.assign(admin, updateData, { updatedAt: new Date() });
    await repo.save(admin);

    return options.new !== false ? admin : null;
  },

  /**
   * Delete admin (soft delete)
   */
  async findByIdAndDelete(id) {
    const repo = await getAdminRepository();
    const admin = await repo.fetch(id);
    if (!admin || !admin.email) return null;

    admin.isDeleted = true;
    admin.updatedAt = new Date();
    await repo.save(admin);

    return admin;
  },

  /**
   * Find all admins with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getAdminRepository();
    let search = repo.search();

    // Default: exclude deleted
    if (query.includeDeleted !== true) {
      search = search.where('isDeleted').equals(false);
    }

    // Apply filters
    if (query.accountStatus) {
      search = search.where('accountStatus').equals(query.accountStatus);
    }
    if (query.role) {
      search = search.where('role').equals(query.role);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const admins = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return admins;
  },

  /**
   * Find active admins
   */
  async findActive() {
    const repo = await getAdminRepository();
    return repo.search()
      .where('isDeleted').equals(false)
      .where('accountStatus').equals('active')
      .return.all();
  },

  /**
   * Count admins
   */
  async countDocuments(query = {}) {
    const repo = await getAdminRepository();
    let search = repo.search();

    if (query.includeDeleted !== true) {
      search = search.where('isDeleted').equals(false);
    }
    if (query.accountStatus) {
      search = search.where('accountStatus').equals(query.accountStatus);
    }
    if (query.role) {
      search = search.where('role').equals(query.role);
    }

    return search.return.count();
  },

  /**
   * Compare password
   */
  async comparePassword(admin, candidatePassword) {
    if (!admin.password) return false;
    return comparePassword(candidatePassword, admin.password);
  },

  /**
   * Check if email exists
   */
  async emailExists(email) {
    const admin = await this.findByEmail(email);
    return !!admin;
  },
};

export default AdminModel;
