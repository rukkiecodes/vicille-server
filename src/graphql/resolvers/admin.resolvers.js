import { GraphQLError } from 'graphql';
import AdminModel from '../../modules/admin/admin.model.js';
import UserModel from '../../modules/users/user.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import OrderModel from '../../modules/orders/order.model.js';
import SubscriptionModel from '../../modules/subscriptions/subscription.model.js';
import WalletModel from '../../modules/wallet/wallet.model.js';
import { requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import { generateActivationCode } from '../../core/utils/randomCode.js';
import emailService from '../../services/email.service.js';
import logger from '../../core/logger/index.js';

const adminResolvers = {
  Query: {
    admin: async (_, { id }, context) => {
      requireAdmin(context);
      const admin = await AdminModel.findById(id);
      if (!admin) {
        throw new GraphQLError('Admin not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(admin);
    },

    admins: async (_, { pagination = {} }, context) => {
      requireAdmin(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const offset = (page - 1) * limit;

      const admins = await AdminModel.find({}, { limit, offset });
      const total = await AdminModel.countDocuments({});

      return buildPaginatedResponse(entitiesToJSON(admins), total, page, limit);
    },

    dashboardStats: async (_, __, context) => {
      requireAdmin(context);

      try {
        const [
          totalUsers,
          activeUsers,
          totalTailors,
          activeTailors,
          totalOrders,
          pendingOrders,
          activeSubscriptions,
        ] = await Promise.all([
          UserModel.countDocuments({}),
          UserModel.countDocuments({ accountStatus: 'active' }),
          TailorModel.countDocuments({}),
          TailorModel.countDocuments({ accountStatus: 'active' }),
          OrderModel.countDocuments({}),
          OrderModel.countDocuments({ status: 'styling_in_progress' }),
          SubscriptionModel.countDocuments({ status: 'active' }),
        ]);

        return {
          totalUsers,
          activeUsers,
          totalTailors,
          activeTailors,
          totalOrders,
          pendingOrders,
          activeSubscriptions,
          totalRevenue: 0, // Would need payment aggregation
        };
      } catch (error) {
        logger.error('dashboardStats error:', error);
        return {
          totalUsers: 0,
          activeUsers: 0,
          totalTailors: 0,
          activeTailors: 0,
          totalOrders: 0,
          pendingOrders: 0,
          activeSubscriptions: 0,
          totalRevenue: 0,
        };
      }
    },
  },

  Mutation: {
    createAdmin: async (_, { input }, context) => {
      const authAdmin = requireAdmin(context);

      const exists = await AdminModel.emailExists(input.email);
      if (exists) {
        throw new GraphQLError('Email already registered', {
          extensions: { code: 'CONFLICT' },
        });
      }

      const admin = await AdminModel.create({
        ...input,
        createdBy: authAdmin.id,
      });
      return entityToJSON(admin);
    },

    updateAdmin: async (_, { id, input }, context) => {
      requireAdmin(context);
      const admin = await AdminModel.findByIdAndUpdate(id, input, { new: true });
      if (!admin) {
        throw new GraphQLError('Admin not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(admin);
    },

    deleteAdmin: async (_, { id }, context) => {
      const authAdmin = requireAdmin(context);
      if (authAdmin.id === id) {
        throw new GraphQLError('Cannot delete your own account', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      await AdminModel.findByIdAndDelete(id);
      return { success: true, message: 'Admin deleted' };
    },

    createClientAccount: async (_, { email, fullName, phone }, context) => {
      const authAdmin = requireAdmin(context);

      const existing = await UserModel.findByEmail(email);
      if (existing) {
        throw new GraphQLError('A client account with this email already exists', {
          extensions: { code: 'CONFLICT' },
        });
      }

      const passcode = generateActivationCode(); // 6-digit numeric code
      const user = await UserModel.create({
        email,
        fullName,
        phone: phone || null,
        activationCode: passcode,
        status: 'inactive',
        createdByAdminId: authAdmin.id,
      });

      // Create wallet for the new user (non-fatal if it fails)
      try {
        await WalletModel.create(user.id);
      } catch (walletError) {
        logger.error(`createClientAccount: failed to create wallet for ${user.id}:`, walletError);
      }

      try {
        await emailService.sendActivationCodeEmail(email, fullName, passcode);
      } catch (emailError) {
        logger.error('createClientAccount: failed to send invite email:', emailError);
      }

      logger.info(`Client account created by admin ${authAdmin.id}: ${email}`);

      return {
        success:  true,
        message:  'Client account created. Passcode sent via email.',
        user:     entityToJSON(user),
        passcode,
      };
    },

    suspendUser: async (_, { userId, reason }, context) => {
      requireAdmin(context);
      const user = await UserModel.findByIdAndUpdate(userId, { accountStatus: 'suspended' });
      if (!user) {
        throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return entityToJSON(user);
    },

    reactivateUser: async (_, { userId }, context) => {
      requireAdmin(context);
      const user = await UserModel.findByIdAndUpdate(userId, { accountStatus: 'active' });
      if (!user) {
        throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return entityToJSON(user);
    },
  },
};

export default adminResolvers;
