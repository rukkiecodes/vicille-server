import gql from 'graphql-tag';
import commonTypeDefs from './common.typeDefs.js';
import authTypeDefs from './auth.typeDefs.js';
import userTypeDefs from './user.typeDefs.js';
import tailorTypeDefs from './tailor.typeDefs.js';
import orderTypeDefs from './order.typeDefs.js';
import measurementTypeDefs from './measurement.typeDefs.js';
import subscriptionTypeDefs from './subscription.typeDefs.js';
import jobTypeDefs from './job.typeDefs.js';
import paymentTypeDefs from './payment.typeDefs.js';
import adminTypeDefs from './admin.typeDefs.js';
import styleTypeDefs from './style.typeDefs.js';
import referralTypeDefs from './referral.typeDefs.js';
import ratingTypeDefs from './rating.typeDefs.js';
import walletTypeDefs from './wallet.typeDefs.js';
import stitchdTypeDefs from './stitchd.typeDefs.js';
import stitchdAuthTypeDefs from './stitchdAuth.typeDefs.js';
import stitchdCustomerTypeDefs from './stitchdCustomer.typeDefs.js';
import stitchdMeasurementTypeDefs from './stitchdMeasurement.typeDefs.js';
import stitchdOrderTypeDefs from './stitchdOrder.typeDefs.js';
import stitchdPaymentTypeDefs from './stitchdPayment.typeDefs.js';
import stitchdThreadTypeDefs from './stitchdThread.typeDefs.js';
import stitchdDashboardTypeDefs from './stitchdDashboard.typeDefs.js';
import stitchdAiTypeDefs from './stitchdAi.typeDefs.js';
import stitchdSyncTypeDefs from './stitchdSync.typeDefs.js';
import stitchdTelemetryTypeDefs from './stitchdTelemetry.typeDefs.js';
import stitchdPayoutTypeDefs from './stitchdPayout.typeDefs.js';
import stitchdBillingTypeDefs from './stitchdBilling.typeDefs.js';
import stitchdAiSuiteTypeDefs from './stitchdAiSuite.typeDefs.js';
import stitchdRelationshipTypeDefs from './stitchdRelationship.typeDefs.js';
import stitchdAnalyticsTypeDefs from './stitchdAnalytics.typeDefs.js';
import stitchdAccountTypeDefs from './stitchdAccount.typeDefs.js';
import stitchdTeamTypeDefs from './stitchdTeam.typeDefs.js';
import stitchdEnterpriseTypeDefs from './stitchdEnterprise.typeDefs.js';
import stitchdPortalTypeDefs from './stitchdPortal.typeDefs.js';
import stitchdTemplatesTypeDefs from './stitchdTemplates.typeDefs.js';
import stitchdStyleUTypeDefs from './stitchdStyleU.typeDefs.js';
import stitchdCommsTypeDefs from './stitchdComms.typeDefs.js';

// Base type definitions with root Query and Mutation types
const baseTypeDefs = gql`
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }
`;

const typeDefs = [
  baseTypeDefs,
  commonTypeDefs,
  authTypeDefs,
  userTypeDefs,
  tailorTypeDefs,
  orderTypeDefs,
  measurementTypeDefs,
  subscriptionTypeDefs,
  jobTypeDefs,
  paymentTypeDefs,
  adminTypeDefs,
  styleTypeDefs,
  referralTypeDefs,
  ratingTypeDefs,
  walletTypeDefs,
  stitchdTypeDefs,
  stitchdAuthTypeDefs,
  stitchdCustomerTypeDefs,
  stitchdMeasurementTypeDefs,
  stitchdOrderTypeDefs,
  stitchdPaymentTypeDefs,
  stitchdThreadTypeDefs,
  stitchdDashboardTypeDefs,
  stitchdAiTypeDefs,
  stitchdSyncTypeDefs,
  stitchdTelemetryTypeDefs,
  stitchdPayoutTypeDefs,
  stitchdBillingTypeDefs,
  stitchdAiSuiteTypeDefs,
  stitchdRelationshipTypeDefs,
  stitchdAnalyticsTypeDefs,
  stitchdAccountTypeDefs,
  stitchdTeamTypeDefs,
  stitchdEnterpriseTypeDefs,
  stitchdPortalTypeDefs,
  stitchdTemplatesTypeDefs,
  stitchdStyleUTypeDefs,
  stitchdCommsTypeDefs,
];

export default typeDefs;
