import { GraphQLError } from 'graphql';
import UserModel from '../../modules/users/user.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import AdminModel from '../../modules/admin/admin.model.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../middlewares/auth.middleware.js';
import { generateActivationCode } from '../../core/utils/randomCode.js';
import emailService from '../../services/email.service.js';
import logger from '../../core/logger/index.js';

const authResolvers = {
  Mutation: {
    requestActivationCode: async (_, { email, fullName, phone }) => {
      try {
        let user = await UserModel.findByEmail(email);

        if (!user) {
          // Create new user
          const code = generateActivationCode(8);
          user = await UserModel.create({
            email,
            fullName: fullName || email.split('@')[0],
            phone,
            activationCode: code,
            accountStatus: 'pending',
          });

          logger.info(`New user created: ${email}, activation code: ${code}`);
        } else {
          // Generate new code for existing user
          const code = generateActivationCode(8);
          await UserModel.findByIdAndUpdate(user.entityId, {
            activationCode: code,
          });

          logger.info(`Activation code regenerated for: ${email}, code: ${code}`);
        }

        // Send activation code email
        try {
          const updatedUser = await UserModel.findByEmail(email);
          await emailService.sendActivationCodeEmail(
            email,
            fullName || updatedUser.fullName,
            updatedUser.activationCode
          );
        } catch (emailError) {
          logger.error('Failed to send activation email, but code was generated:', emailError);
          // Don't throw error - code was generated, email might fail but user can still proceed
        }

        return {
          success: true,
          message: 'Activation code sent to your email',
        };
      } catch (error) {
        logger.error('requestActivationCode error:', error);
        throw new GraphQLError('Failed to send activation code', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    verifyActivationCode: async (_, { email, code }) => {
      try {
        const user = await UserModel.findByEmail(email);

        if (!user) {
          throw new GraphQLError('User not found', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        const isValid = await UserModel.compareActivationCode(user, code);
        if (!isValid) {
          await UserModel.incrementFailedAttempts(user);
          throw new GraphQLError('Invalid activation code', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        // Activate user
        await UserModel.findByIdAndUpdate(user.entityId, {
          isActivated: true,
          activatedAt: new Date(),
          accountStatus: 'active',
          activationCode: null,
        });

        await UserModel.resetFailedAttempts(user);

        const tokenPayload = {
          id: user.entityId,
          email: user.email,
          role: 'user',
          type: 'user',
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        const updatedUser = await UserModel.findById(user.entityId);

        return {
          accessToken,
          refreshToken,
          user: updatedUser ? updatedUser.toSafeJSON() : null,
          type: 'user',
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        logger.error('verifyActivationCode error:', error);
        throw new GraphQLError('Verification failed', {
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

        if (tailor.accountStatus !== 'active') {
          throw new GraphQLError('Account is not active', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        const tokenPayload = {
          id: tailor.entityId,
          email: tailor.email,
          role: 'tailor',
          type: 'tailor',
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        // Update last active
        await TailorModel.findByIdAndUpdate(tailor.entityId, {
          lastActiveAt: new Date(),
        });

        return {
          accessToken,
          refreshToken,
          tailor: tailor.toSafeJSON(),
          type: 'tailor',
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        logger.error('tailorLogin error:', error);
        throw new GraphQLError('Login failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    tailorRegister: async (_, { input }) => {
      try {
        const exists = await TailorModel.emailExists(input.email);
        if (exists) {
          throw new GraphQLError('Email already registered', {
            extensions: { code: 'CONFLICT' },
          });
        }

        const tailor = await TailorModel.create({
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          password: input.password,
          specialties: input.specialties || [],
          verificationStatus: 'pending',
          accountStatus: 'active',
        });

        const tokenPayload = {
          id: tailor.entityId,
          email: tailor.email,
          role: 'tailor',
          type: 'tailor',
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return {
          accessToken,
          refreshToken,
          tailor: tailor.toSafeJSON(),
          type: 'tailor',
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        logger.error('tailorRegister error:', error);
        throw new GraphQLError('Registration failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

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

        if (admin.accountStatus !== 'active') {
          throw new GraphQLError('Account is not active', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        const tokenPayload = {
          id: admin.entityId,
          email: admin.email,
          role: admin.role,
          type: 'admin',
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        await AdminModel.findByIdAndUpdate(admin.entityId, {
          lastLoginAt: new Date(),
        });

        return {
          accessToken,
          refreshToken,
          admin: admin.toSafeJSON(),
          type: 'admin',
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        logger.error('adminLogin error:', error);
        throw new GraphQLError('Login failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    refreshToken: async (_, { refreshToken: token }) => {
      try {
        const decoded = verifyRefreshToken(token);

        const tokenPayload = {
          id: decoded.sub,
          type: decoded.type,
        };

        // Fetch user to get current email/role
        let entity = null;
        if (decoded.type === 'user') {
          entity = await UserModel.findById(decoded.sub);
        } else if (decoded.type === 'tailor') {
          entity = await TailorModel.findById(decoded.sub);
        } else if (decoded.type === 'admin') {
          entity = await AdminModel.findById(decoded.sub);
        }

        if (!entity) {
          throw new GraphQLError('User not found', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        tokenPayload.email = entity.email;
        tokenPayload.role = decoded.type === 'admin' ? entity.role : decoded.type;

        const accessToken = generateAccessToken(tokenPayload);
        const newRefreshToken = generateRefreshToken(tokenPayload);

        return {
          accessToken,
          refreshToken: newRefreshToken,
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        logger.error('refreshToken error:', error);
        throw new GraphQLError('Token refresh failed', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
    },
  },
};

export default authResolvers;
