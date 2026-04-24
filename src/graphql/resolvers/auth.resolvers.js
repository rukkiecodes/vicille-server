import { GraphQLError } from 'graphql';
import UserModel from '../../modules/users/user.model.js';
import TailorModel from '../../modules/tailors/tailor.model.js';
import AdminModel from '../../modules/admin/admin.model.js';
import ReferralModel from '../../modules/referrals/referral.model.js';
import NotificationModel from '../../modules/notifications/notification.model.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../middlewares/auth.middleware.js';
import { generateActivationCode, generateSessionId } from '../../core/utils/randomCode.js';
import { query } from '../../infrastructure/database/postgres.js';
import emailService from '../../services/email.service.js';
import logger from '../../core/logger/index.js';
import { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } from '../../core/constants/notificationTypes.js';

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

const authResolvers = {
  Mutation: {
    // ─── CLIENT AUTH ─────────────────────────────────────────────────────────

    clientSignup: async (_, { input }) => {
      try {
        const email      = input.email.trim().toLowerCase();
        const fullName   = input.fullName.trim();
        const phone      = input.phone?.trim() || null;
        const referralCode = input.referralCode?.trim().toUpperCase() || null;

        const existingByEmail = await UserModel.findByEmail(email);
        if (existingByEmail) {
          throw new GraphQLError('Email already registered', {
            extensions: { code: 'CONFLICT' },
          });
        }

        if (phone) {
          const existingByPhone = await UserModel.findByPhone(phone);
          if (existingByPhone) {
            throw new GraphQLError('Phone number already registered', {
              extensions: { code: 'CONFLICT' },
            });
          }
        }

        const activationCode = generateActivationCode();

        await UserModel.create({
          fullName,
          email,
          phone,
          activationCode,
          status: 'pending',
        });

        try {
          await emailService.sendActivationCodeEmail(email, fullName, activationCode);
        } catch (emailError) {
          logger.error('clientSignup email error:', emailError);
        }

        // ── Handle referral code (fire-and-forget) ────────────────────────────
        if (referralCode) {
          (async () => {
            try {
              const result = await ReferralModel.createInviteFromReferralCode({
                referralCode,
                invitedEmail: email,
              });

              if (!result) return; // unknown code or duplicate — ignore silently

              const { referrerId } = result;
              const referrer = await UserModel.findById(referrerId);
              if (!referrer) return;

              // In-app notification to referrer
              await NotificationModel.create({
                recipientId:   referrerId,
                recipientRole: 'user',
                type:          NOTIFICATION_TYPE.REFERRAL_SIGNUP,
                channel:       [NOTIFICATION_CHANNEL.IN_APP],
                title:         'New referral signup!',
                message:       `${fullName} just signed up using your referral code. You'll earn a reward once they subscribe.`,
                status:        NOTIFICATION_STATUS.SENT,
                sentAt:        new Date(),
                data:          { newUserName: fullName, newUserEmail: email },
              });

              // Email notification to referrer
              emailService.sendReferralSignupEmail(referrer.email, referrer.fullName, fullName)
                .catch(e => logger.error('referral signup email error:', e));
            } catch (refErr) {
              logger.error('clientSignup referral handling error:', refErr);
            }
          })();
        }

        return {
          success: true,
          message: 'Signup successful. Your account is pending admin approval before you can log in.',
        };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('clientSignup error:', error);
        throw new GraphQLError('Signup failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    clientLogin: async (_, { passcode }) => {
      try {
        const user = await UserModel.findByActivationCode(passcode);

        if (!user) {
          throw new GraphQLError('Invalid passcode', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        if (user.status !== 'active') {
          const message = user.status === 'suspended'
            ? 'Your account has been suspended. Contact support.'
            : 'Your account is pending admin approval. Please try again after approval.';

          throw new GraphQLError(message, {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        await UserModel.resetFailedAttempts(user);

        // Mark account as activated on first successful login after admin approval.
        if (!user.isActivated) {
          await UserModel.findByIdAndUpdate(user.entityId, {
            isActivated: true,
            activatedAt: new Date(),
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

        // Fire-and-forget: register user as a Paystack customer if not already done.
        // This ensures they have a customer_code before they ever try to subscribe.
        if (!updatedUser.paystackCustomerCode) {
          const PAY_URL = process.env.PAYMENTS_SERVICE_URL || process.env.VICELLE_PAY_URL || 'http://localhost:5000';
          const PAY_KEY = process.env.INTERNAL_SERVICE_KEY || '';
          fetch(`${PAY_URL}/customer/ensure`, {
            method:  'POST',
            headers: { 'x-service-key': PAY_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId:    updatedUser.entityId,
              email:     updatedUser.email,
              firstName: updatedUser.fullName?.split(' ')[0],
              lastName:  updatedUser.fullName?.split(' ').slice(1).join(' '),
            }),
          })
            .then(r => r.json())
            .then(({ customerCode }) => {
              if (customerCode) {
                UserModel.findByIdAndUpdate(updatedUser.entityId, { paystackCustomerCode: customerCode })
                  .catch(() => {});
              }
            })
            .catch(() => {}); // never blocks login
        }

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

        if (!user) {
          return { success: true, message: 'If an account exists, your passcode has been resent.' };
        }

        // Generate a code if the user doesn't have one yet (existing users pre-migration)
        let code = user.activationCode;
        if (!code) {
          code = generateActivationCode();
          await UserModel.findByIdAndUpdate(user.entityId, { activationCode: code });
        }

        try {
          await emailService.sendActivationCodeEmail(user.email, user.fullName, code);
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
          tailorType:  input.tailorType || 'vicelle',
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
