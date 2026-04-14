import scalarResolvers from './scalar.resolvers.js';
import authResolvers from './auth.resolvers.js';
import userResolvers from './user.resolvers.js';
import tailorResolvers from './tailor.resolvers.js';
import orderResolvers from './order.resolvers.js';
import measurementResolvers from './measurement.resolvers.js';
import subscriptionResolvers from './subscription.resolvers.js';
import jobResolvers from './job.resolvers.js';
import paymentResolvers from './payment.resolvers.js';
import adminResolvers from './admin.resolvers.js';
import styleResolvers from './style.resolvers.js';
import referralResolvers from './referral.resolvers.js';
import ratingResolvers from './rating.resolvers.js';
import walletResolvers from './wallet.resolvers.js';

const resolvers = [
  scalarResolvers,
  authResolvers,
  userResolvers,
  tailorResolvers,
  orderResolvers,
  measurementResolvers,
  subscriptionResolvers,
  jobResolvers,
  paymentResolvers,
  adminResolvers,
  styleResolvers,
  referralResolvers,
  ratingResolvers,
  walletResolvers,
];

export default resolvers;
