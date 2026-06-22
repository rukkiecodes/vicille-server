import gql from 'graphql-tag';

/**
 * Stitchd payouts GraphQL surface (batch 10) — weekly settlement of collected funds to the
 * tailor's bank. Namespaced, tenant-scoped via `requireTailor`. Money fields are Float (NGN).
 */
const stitchdPayoutTypeDefs = gql`
  extend type Query {
    "Collected-but-unsettled balance, what's eligible now, and the next weekly run date."
    stitchdPendingPayout: StitchdPendingPayout!

    "Past + in-flight payouts, newest first."
    stitchdPayouts: [StitchdPayout!]!

    "A single payout with its itemised breakdown."
    stitchdPayout(id: ID!): StitchdPayout

    "The tailor's default payout bank account on file (null if none)."
    stitchdPayoutBankAccount: StitchdPayoutBankAccount

    "Nigerian banks for the bank-account picker."
    stitchdBankList: [StitchdBank!]!
  }

  extend type Mutation {
    "Resolve + verify a bank account, create a Paystack transfer recipient, set it as default."
    setStitchdPayoutBankAccount(input: SetStitchdPayoutBankInput!): StitchdPayoutBankAccount!
  }

  type StitchdPendingPayout {
    pendingBalance: Float!
    nextPayoutEstimate: Float!
    nextPayoutDate: String!
    currency: String!
  }

  type StitchdPayout {
    id: ID!
    periodStart: DateTime
    periodEnd: DateTime
    scheduledFor: DateTime
    status: String!
    grossAmount: Float!
    feeTotal: Float!
    netAmount: Float!
    currency: String!
    provider: String!
    bankAccount: JSON
    failureReason: String
    createdAt: DateTime
    settledAt: DateTime
    items: [StitchdPayoutItem!]!
  }

  type StitchdPayoutItem {
    id: ID!
    paymentId: ID!
    orderId: ID
    orderNumber: Int
    gross: Float!
    fee: Float!
    net: Float!
  }

  type StitchdPayoutBankAccount {
    id: ID!
    bankCode: String!
    bankName: String
    accountNumber: String!
    accountName: String
    isDefault: Boolean!
    verifiedAt: DateTime
  }

  type StitchdBank {
    name: String!
    code: String!
  }

  input SetStitchdPayoutBankInput {
    bankCode: String!
    accountNumber: String!
  }
`;

export default stitchdPayoutTypeDefs;
