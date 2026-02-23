import { GraphQLError } from 'graphql';
import UserModel from '../../modules/users/user.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import AdminModel from '../../modules/admin/admin.model.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../middlewares/auth.middleware.js';
import { generateSessionId } from '../../core/utils/randomCode.js';
import { query } from '../../infrastructure/database/postgres.js';
import emailService from '../../services/email.service.js';
import logger from '../../core/logger/index.js';

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

const authResolvers = {
  Mutation: {
    // ─── CLIENT AUTH ─────────────────────────────────────────────────────────

    clientLogin: async (_, { passcode }) => {
      try {
        const user = await UserModel.findByActivationCode(passcode);

        if (!user) {
          throw new GraphQLError('Invalid passcode', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        await UserModel.resetFailedAttempts(user);

        // Activate on first login if not already active
        if (!user.isActivated || user.status !== 'active') {
          await UserModel.findByIdAndUpdate(user.entityId, {
            isActivated: true,
            activatedAt: new Date(),
            status:      'active',
          });
        }

        await UserModel.findByIdAndUpdate(user.entityId, { lastLoginAt: new Date() });

        const tokenPayload = {
          id:    user.entityId,
          email: user.email,
          role:  'user',
          type:  'user',
        };

        const accessToken  = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);
        const updatedUser  = await UserModel.findById(user.entityId);

        return { accessToken, refreshToken, user: updatedUser.toSafeJSON(), type: 'user' };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('clientLogin error:', error);
        throw new GraphQLError('Login failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    clientForgotPasscode: async (_, { email }) => {
      try {
        const user = await UserModel.findByEmail(email);

        if (!user || !user.activationCode) {
          return { success: true, message: 'If an account exists, your passcode has been resent.' };
        }

        try {
          await emailService.sendActivationCodeEmail(user.email, user.fullName, user.activationCode);
        } catch (emailError) {
          logger.error('clientForgotPasscode email error:', emailError);
        }

        return { success: true, message: 'If an account exists, your passcode has been resent.' };
      } catch (error) {
        logger.error('clientForgotPasscode error:', error);
        throw new GraphQLError('Request failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    // ─── TAILOR AUTH ──────────────────────────────────────────────────────────

    tailorSignup: async (_, { input }) => {
      try {
        const exists = await TailorModel.emailExists(input.email);
        if (exists) {
          throw new GraphQLError('Email already registered', {
            extensions: { code: 'CONFLICT' },
          });
        }

        const tailor = await TailorModel.create({
          fullName:    input.fullName,
          email:       input.email,
          phone:       input.phone,
          password:    input.password,
          specialties: input.specialties || [],
          status:      'pending',
        });

        const tokenPayload = {
          id:    tailor.entityId,
          email: tailor.email,
          role:  'tailor',
          type:  'tailor',
        };

        const accessToken  = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return { accessToken, refreshToken, tailor: tailor.toSafeJSON(), type: 'tailor' };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('tailorSignup error:', error);
        throw new GraphQLError('Registration failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    tailorLogin: async (_, { email, password }) => {
      try {
        const tailor = await TailorModel.findByEmail(email);

        if (!tailor) {
          throw new GraphQLError('Invalid credentials', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        const isValid = await TailorModel.comparePassword(tailor, password);
        if (!isValid) {
          throw new GraphQLError('Invalid credentials', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        await TailorModel.findByIdAndUpdate(tailor.entityId, { lastActiveAt: new Date() });

        const tokenPayload = {
          id:    tailor.entityId,
          email: tailor.email,
          role:  'tailor',
          type:  'tailor',
        };

        const accessToken  = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return { accessToken, refreshToken, tailor: tailor.toSafeJSON(), type: 'tailor' };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('tailorLogin error:', error);
        throw new GraphQLError('Login failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    tailorForgotPassword: async (_, { email }) => {
      try {
        const tailor = await TailorModel.findByEmail(email);

        if (!tailor) {
          const fakeToken = generateSessionId();
          return { success: false, message: 'No account found with that email.', resetToken: fakeToken };
        }

        const resetToken = generateSessionId();
        const expiresAt  = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        await TailorModel.findByIdAndUpdate(tailor.entityId, {
          resetToken,
          resetTokenExpiresAt: expiresAt,
        });

        logger.info(`Password reset token generated for tailor: ${email}`);

        return {
          success:    true,
          message:    'Reset token generated. Use it within 15 minutes.',
          resetToken,
        };
      } catch (error) {
        logger.error('tailorForgotPassword error:', error);
        throw new GraphQLError('Request failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    tailorResetPassword: async (_, { token, newPassword }) => {
      try {
        const { rows } = await query(
          'SELECT * FROM tailors WHERE reset_token=$1 AND is_deleted=FALSE',
          [token]
        );

        if (!rows.length) {
          throw new GraphQLError('Invalid or expired reset token', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        const row = rows[0];
        if (!row.reset_token_expires_at || new Date() > new Date(row.reset_token_expires_at)) {
          throw new GraphQLError('Reset token has expired', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        await TailorModel.findByIdAndUpdate(row.id, {
          password:            newPassword,
          resetToken:          null,
          resetTokenExpiresAt: null,
        });

        return true;
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('tailorResetPassword error:', error);
        throw new GraphQLError('Password reset failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    // ─── ADMIN AUTH ───────────────────────────────────────────────────────────

    adminLogin: async (_, { email, password }) => {
      try {
        const admin = await AdminModel.findByEmail(email);

        if (!admin) {
          throw new GraphQLError('Invalid credentials', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        const isValid = await AdminModel.comparePassword(admin, password);
        if (!isValid) {
          throw new GraphQLError('Invalid credentials', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        if (!admin.isActive) {
          throw new GraphQLError('Account is not active', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        await AdminModel.findByIdAndUpdate(admin.entityId, { lastLoginAt: new Date() });

        const tokenPayload = {
          id:    admin.entityId,
          email: admin.email,
          role:  admin.role,
          type:  'admin',
        };

        const accessToken  = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return { accessToken, refreshToken, admin: admin.toSafeJSON(), type: 'admin' };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('adminLogin error:', error);
        throw new GraphQLError('Login failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    // ─── TOKEN REFRESH ────────────────────────────────────────────────────────

    refreshToken: async (_, { refreshToken: token }) => {
      try {
        const decoded = verifyRefreshToken(token);

        let entity = null;
        if (decoded.type === 'user') {
          entity = await UserModel.findById(decoded.sub);
        } else if (decoded.type === 'tailor') {
          entity = await TailorModel.findById(decoded.sub);
        } else if (decoded.type === 'admin') {
          entity = await AdminModel.findById(decoded.sub);
        }

        if (!entity) {
          throw new GraphQLError('Account not found', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        const tokenPayload = {
          id:    decoded.sub,
          email: entity.email,
          role:  decoded.type === 'admin' ? entity.role : decoded.type,
          type:  decoded.type,
        };

        const accessToken     = generateAccessToken(tokenPayload);
        const newRefreshToken = generateRefreshToken(tokenPayload);

        return { accessToken, refreshToken: newRefreshToken };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('refreshToken error:', error);
        throw new GraphQLError('Token refresh failed', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
    },
  },
};

export default authResolvers;
