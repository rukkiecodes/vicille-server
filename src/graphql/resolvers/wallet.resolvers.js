import { GraphQLError } from 'graphql';
import WalletModel from '../../modules/wallet/wallet.model.js';
import WalletTransactionModel from '../../modules/wallet/walletTransaction.model.js';
import SavedCardModel from '../../modules/wallet/savedCard.model.js';
import UserModel from '../../modules/users/user.model.js';
import paymentsService from '../../services/paymentsService.js';
import { requireAuth } from '../helpers.js';
import logger from '../../core/logger/index.js';

const walletResolvers = {
  Query: {
    // ── GET /myWallet ──────────────────────────────────────────────────────────
    myWallet: async (_, __, context) => {
      const authUser = requireAuth(context);
      const wallet   = await WalletModel.findByUserId(authUser.id);
      return wallet || null;
    },

    // ── GET /myWalletTransactions ──────────────────────────────────────────────
    myWalletTransactions: async (_, { pagination = {} }, context) => {
      const authUser = requireAuth(context);
      const page     = pagination.page  || 1;
      const limit    = pagination.limit || 20;
      const offset   = (page - 1) * limit;

      const [txs, total] = await Promise.all([
        WalletTransactionModel.findByUserId(authUser.id, { limit, offset }),
        WalletTransactionModel.countByUserId(authUser.id),
      ]);

      const pages = Math.ceil(total / limit);
      return {
        nodes:    txs,
        pageInfo: { page, limit, total, pages, hasNextPage: page < pages },
      };
    },

    // ── GET /mySavedCards ──────────────────────────────────────────────────────
    mySavedCards: async (_, __, context) => {
      const authUser = requireAuth(context);
      return SavedCardModel.findByUserId(authUser.id);
    },
  },

  Mutation: {
    // ── initializeWalletTopUp ──────────────────────────────────────────────────
    // Opens a Paystack hosted page — user pays and the charge.success webhook
    // fires WALLET_TOPUP_CARD to credit the wallet.
    initializeWalletTopUp: async (_, { amountKobo, callbackUrl }, context) => {
      const authUser = requireAuth(context);

      if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
        throw new GraphQLError('amountKobo must be a positive integer', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      // Ensure wallet exists
      let wallet = await WalletModel.findByUserId(authUser.id);
      if (!wallet) {
        wallet = await WalletModel.create(authUser.id);
      }

      try {
        const result = await paymentsService.initializeTopUp({
          email:       authUser.email,
          userId:      authUser.id,
          amountKobo,
          callbackUrl: callbackUrl || undefined,
        });
        return { authorizationUrl: result.authorizationUrl, reference: result.reference };
      } catch (err) {
        logger.error('[wallet] initializeWalletTopUp failed:', err.message);
        throw new GraphQLError('Could not initialize top-up. Please try again.', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }
    },

    // ── chargeWalletWithCard ───────────────────────────────────────────────────
    // Charges a saved card directly — no redirect needed.
    // The charge.success webhook credits the wallet.
    chargeWalletWithCard: async (_, { cardId, amountKobo }, context) => {
      const authUser = requireAuth(context);

      if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
        throw new GraphQLError('amountKobo must be a positive integer', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const card = await SavedCardModel.findById(cardId);
      if (!card || card.userId !== authUser.id) {
        throw new GraphQLError('Card not found', { extensions: { code: 'NOT_FOUND' } });
      }

      try {
        const result = await paymentsService.chargeTopUp({
          authorizationCode: card.authorizationCode,
          email:             authUser.email,
          userId:            authUser.id,
          amountKobo,
        });
        // Returns a reference — wallet credit happens async via webhook.
        return { authorizationUrl: '', reference: result.reference };
      } catch (err) {
        logger.error('[wallet] chargeWalletWithCard failed:', err.message);
        throw new GraphQLError('Card charge failed. Please try again.', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }
    },

    // ── requestWalletDva ───────────────────────────────────────────────────────
    // Triggers DVA assignment for the user. The account arrives async via the
    // dedicatedaccount.assign.success webhook which updates wallet.dvaAssigned.
    requestWalletDva: async (_, __, context) => {
      const authUser = requireAuth(context);

      let wallet = await WalletModel.findByUserId(authUser.id);
      if (!wallet) wallet = await WalletModel.create(authUser.id);

      if (wallet.dvaAssigned) {
        throw new GraphQLError('A dedicated virtual account is already assigned to your wallet', {
          extensions: { code: 'CONFLICT' },
        });
      }

      const nameParts = (authUser.fullName || '').split(' ');
      try {
        await paymentsService.assignDva({
          email:     authUser.email,
          firstName: nameParts[0]              || '',
          lastName:  nameParts.slice(1).join(' ') || '',
          phone:     authUser.phone || undefined,
        });
        logger.info('[wallet] DVA assignment requested for user:', authUser.id);
      } catch (err) {
        logger.error('[wallet] requestWalletDva failed:', err.message);
        throw new GraphQLError('Could not request virtual account. Please try again.', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }

      return wallet;
    },

    // ── setDefaultCard ─────────────────────────────────────────────────────────
    setDefaultCard: async (_, { cardId }, context) => {
      const authUser = requireAuth(context);
      const card = await SavedCardModel.findById(cardId);
      if (!card || card.userId !== authUser.id) {
        throw new GraphQLError('Card not found', { extensions: { code: 'NOT_FOUND' } });
      }
      const updated = await SavedCardModel.setDefault(authUser.id, cardId);
      if (!updated) {
        throw new GraphQLError('Failed to update default card', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
      return updated;
    },

    // ── deleteCard ─────────────────────────────────────────────────────────────
    deleteCard: async (_, { cardId }, context) => {
      const authUser = requireAuth(context);
      const card = await SavedCardModel.findById(cardId);
      if (!card || card.userId !== authUser.id) {
        throw new GraphQLError('Card not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return SavedCardModel.delete(authUser.id, cardId);
    },
  },
};

export default walletResolvers;
