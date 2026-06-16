import gql from 'graphql-tag';

/**
 * Stitchd payment GraphQL surface (batch 05).
 *
 * Cash recording + balances + money dashboard. Namespaced `stitchd*`, tenant-scoped via
 * `requireTailor`. Money fields are Float (NGN). In-app digital collection is P2 (batch 09).
 */
const stitchdPaymentTypeDefs = gql`
  extend type Query {
    "Customers who owe, aggregated across their orders. Sort by amount or age."
    stitchdOutstandingBalances(sort: StitchdBalanceSort = AMOUNT): [StitchdOutstandingBalance!]!

    "Payment history for one customer, newest first."
    stitchdCustomerPayments(customerId: ID!): [StitchdPayment!]!

    "Aggregates for the Money Dashboard (this-week paid/pending, outstanding, trend, recent)."
    stitchdMoneyDashboard(weekStart: String): StitchdMoneyDashboard!
  }

  extend type Mutation {
    "Record a cash payment (idempotent on clientUuid). Returns the payment and updated order."
    recordStitchdCashPayment(input: RecordStitchdCashPaymentInput!): StitchdPaymentResult!
  }

  enum StitchdBalanceSort { AMOUNT AGE }

  type StitchdPayment {
    id: ID!
    clientUuid: ID!
    customerId: ID!
    customerName: String
    orderId: ID
    type: String!
    amount: Float!
    currency: String!
    paidOn: DateTime
    method: String!
    reference: String
    settlementStatus: String!
    note: String
    createdAt: DateTime
  }

  type StitchdPaymentResult {
    payment: StitchdPayment!
    order: StitchdOrder
  }

  type StitchdOutstandingBalance {
    customerId: ID!
    name: String!
    phone: String
    profilePhoto: String
    totalOwed: Float!
    oldestUnpaidOrderDate: String
    openOrderCount: Int!
  }

  type StitchdMoneyTrendPoint {
    month: String!
    paid: Float!
  }

  type StitchdMoneyDashboard {
    weekStart: String!
    thisWeekPaid: Float!
    thisWeekPending: Float!
    outstandingTotal: Float!
    outstandingCustomerCount: Int!
    monthlyTrend: [StitchdMoneyTrendPoint!]!
    recentTransactions: [StitchdPayment!]!
  }

  input RecordStitchdCashPaymentInput {
    "Client-generated UUID — idempotency key for offline-first capture (doc 01 §8)."
    clientUuid: ID!
    customerId: ID!
    orderId: ID
    amount: Float!
    paidOn: String
    note: String
    currency: String
  }
`;

export default stitchdPaymentTypeDefs;
