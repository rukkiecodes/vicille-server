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
];

export default typeDefs;
