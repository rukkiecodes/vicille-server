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
import stitchdResolvers from './stitchd.resolvers.js';
import stitchdAuthResolvers from './stitchdAuth.resolvers.js';
import stitchdCustomerResolvers from './stitchdCustomer.resolvers.js';
import stitchdMeasurementResolvers from './stitchdMeasurement.resolvers.js';
import stitchdOrderResolvers from './stitchdOrder.resolvers.js';
import stitchdPaymentResolvers from './stitchdPayment.resolvers.js';
import stitchdThreadResolvers from './stitchdThread.resolvers.js';
import stitchdDashboardResolvers from './stitchdDashboard.resolvers.js';
import stitchdAiResolvers from './stitchdAi.resolvers.js';

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
  stitchdResolvers,
  stitchdAuthResolvers,
  stitchdCustomerResolvers,
  stitchdMeasurementResolvers,
  stitchdOrderResolvers,
  stitchdPaymentResolvers,
  stitchdThreadResolvers,
  stitchdDashboardResolvers,
  stitchdAiResolvers,
];

export default resolvers;
