import { GraphQLError } from 'graphql';
import { requireAuth } from '../helpers.js';
import ReferralModel from '../../modules/referrals/referral.model.js';
import SubscriptionModel from '../../modules/subscriptions/subscription.model.js';
import UserModel from '../../modules/users/user.model.js';
import NotificationModel from '../../modules/notifications/notification.model.js';
import emailService from '../../services/email.service.js';
import { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } from '../../core/constants/notificationTypes.js';
import logger from '../../core/logger/index.js';

async function hasConfirmedActiveSubscription(userId) {
  const subs = await SubscriptionModel.findByUser(userId);
  return subs.some((s) => s.status === 'active' && ['paid', 'success'].includes(s.paymentStatus));
}

const referralResolvers = {
  Query: {
    myReferralSummary: async (_, __, context) => {
      const authUser = requireAuth(context);
      const activeSubscription = await hasConfirmedActiveSubscription(authUser.id);
      const summary = await ReferralModel.getSummaryByInviter(authUser.id);

      return {
        canInvite: activeSubscription,
        activeSubscription,
        ...summary,
      };
    },

    myReferralInvites: async (_, __, context) => {
      const authUser = requireAuth(context);
      return ReferralModel.findByInviter(authUser.id);
    },

    myReferralWalletTransactions: async (_, __, context) => {
      const authUser = requireAuth(context);
      return ReferralModel.getWalletTransactions(authUser.id);
    },

    myReferralCode: async (_, __, context) => {
      const authUser = requireAuth(context);
      return ReferralModel.getUserReferralCode(authUser.id);
    },
  },

  Mutation: {
    createReferralInvite: async (_, { invitedName, invitedEmail, referralCode }, context) => {
      const authUser = requireAuth(context);

      const activeSubscription = await hasConfirmedActiveSubscription(authUser.id);
      if (!activeSubscription) {
        throw new GraphQLError('Only users with confirmed active subscriptions can invite others', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const normalizedName = invitedName?.trim();
      if (!normalizedName || normalizedName.length < 2) {
        throw new GraphQLError('Friend name is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const normalizedEmail = invitedEmail?.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new GraphQLError('A valid invite email is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const myCode = await ReferralModel.getUserReferralCode(authUser.id);
      if (!myCode) {
        throw new GraphQLError('You do not have a referral code yet', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if ((referralCode || '').trim().toUpperCase() !== myCode.trim().toUpperCase()) {
        throw new GraphQLError('Invalid referral code for this account', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const invite = await ReferralModel.createInvite({
        inviterUserId: authUser.id,
        invitedName: normalizedName,
        invitedEmail: normalizedEmail,
      });

      const adminEmail = process.env.MAILING_EMAIL || process.env.SMTP_USER;
      if (adminEmail) {
        const subject = 'New referral invite pending admin approval';
        const html = `
          <div style="font-family:Segoe UI,Arial,sans-serif;padding:16px;color:#1f1a17;">
            <h2 style="margin:0 0 8px;">Referral invite submitted</h2>
            <p style="margin:0 0 8px;"><strong>Inviter:</strong> ${authUser.fullName || 'Vicelle user'} (${authUser.email || 'no-email'})</p>
            <p style="margin:0 0 8px;"><strong>Referral code:</strong> ${myCode}</p>
            <p style="margin:0 0 8px;"><strong>Invited friend:</strong> ${normalizedName} (${normalizedEmail})</p>
            <p style="margin:12px 0 0;">Open Admin → Referrals → Invite Requests to approve and send passcode.</p>
          </div>
        `;
        const text = `Referral invite submitted\nInviter: ${authUser.fullName || 'Vicelle user'} (${authUser.email || 'no-email'})\nReferral code: ${myCode}\nInvited friend: ${normalizedName} (${normalizedEmail})\nApprove in admin referrals invite requests.`;
        emailService.sendEmail(adminEmail, subject, html, text).catch((e) => {
          logger.error('createReferralInvite admin-notify email error:', e);
        });
      }

      return invite;
    },

    generateMyReferralCode: async (_, __, context) => {
      const authUser = requireAuth(context);
      const code = await ReferralModel.generateUserReferralCode(authUser.id);
      return code;
    },

    submitReferralCode: async (_, { referralCode }, context) => {
      const authUser = requireAuth(context);

      if (!referralCode?.trim()) {
        throw new GraphQLError('Referral code is required', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      const user = await UserModel.findById(authUser.id);
      if (!user) throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });

      const result = await ReferralModel.linkUserToReferralCode({
        referralCode: referralCode.trim().toUpperCase(),
        newUserId:    authUser.id,
        newUserEmail: user.email,
      });

      if (!result) return false; // unknown code, self-referral, or already linked

      const { referrerId } = result;
      const referrer = await UserModel.findById(referrerId);
      if (!referrer) return true;

      // In-app notification (fire-and-forget)
      NotificationModel.create({
        recipientId:   referrerId,
        recipientRole: 'user',
        type:          NOTIFICATION_TYPE.REFERRAL_SIGNUP,
        channel:       [NOTIFICATION_CHANNEL.IN_APP],
        title:         'New referral!',
        message:       `${user.fullName} just joined Vicelle using your referral code. You'll earn a reward once they subscribe.`,
        status:        NOTIFICATION_STATUS.SENT,
        sentAt:        new Date(),
        data:          { newUserName: user.fullName, newUserId: authUser.id },
      }).catch(e => logger.error('submitReferralCode notification error:', e));

      // Email notification (fire-and-forget)
      emailService.sendReferralSignupEmail(referrer.email, referrer.fullName, user.fullName)
        .catch(e => logger.error('submitReferralCode email error:', e));

      return true;
    },

    claimReferralInvite: async (_, { inviteCode }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.findById(authUser.id);

      if (!inviteCode?.trim()) {
        throw new GraphQLError('Invite code is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        return await ReferralModel.claimInvite({
          inviteCode: inviteCode.trim().toUpperCase(),
          invitedUserId: authUser.id,
          invitedEmail: user?.email || null,
        });
      } catch (error) {
        throw new GraphQLError(error.message || 'Failed to claim referral invite', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    },
  },
};

export default referralResolvers;