import { GraphQLError } from 'graphql';
import { requireAuth } from '../helpers.js';
import ReferralModel from '../../modules/referrals/referral.model.js';
import SubscriptionModel from '../../modules/subscriptions/subscription.model.js';
import UserModel from '../../modules/users/user.model.js';

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
  },

  Mutation: {
    createReferralInvite: async (_, { invitedEmail }, context) => {
      const authUser = requireAuth(context);

      const activeSubscription = await hasConfirmedActiveSubscription(authUser.id);
      if (!activeSubscription) {
        throw new GraphQLError('Only users with confirmed active subscriptions can invite others', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const normalizedEmail = invitedEmail?.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new GraphQLError('A valid invite email is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const invite = await ReferralModel.createInvite({
        inviterUserId: authUser.id,
        invitedEmail: normalizedEmail,
      });

      return invite;
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