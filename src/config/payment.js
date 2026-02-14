import config from './index.js';

export const paymentConfig = {
  provider: config.payment.provider,
  paystack: {
    secretKey: config.payment.paystack.secretKey,
    publicKey: config.payment.paystack.publicKey,
    webhookSecret: config.payment.paystack.webhookSecret,
    baseUrl: 'https://api.paystack.co',
    endpoints: {
      initializeTransaction: '/transaction/initialize',
      verifyTransaction: '/transaction/verify',
      chargeAuthorization: '/transaction/charge_authorization',
      refund: '/refund',
      listBanks: '/bank',
      resolveAccount: '/bank/resolve',
      createTransferRecipient: '/transferrecipient',
      initiateTransfer: '/transfer',
      verifyTransfer: '/transfer/verify',
    },
  },
  retrySettings: {
    maxAttempts: config.subscription.maxRetryAttempts,
    intervalHours: config.subscription.retryIntervalHours,
  },
};

export default paymentConfig;
