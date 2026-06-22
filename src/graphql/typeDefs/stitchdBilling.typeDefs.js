import gql from 'graphql-tag';

/**
 * Stitchd subscription billing GraphQL surface (batch 11). Namespaced, tenant-scoped via
 * `requireTailor`. Tier entitlements come from the shared entitlements engine.
 */
const stitchdBillingTypeDefs = gql`
  extend type Query {
    "Current subscription state (tier, status, trial/period/grace dates)."
    stitchdSubscription: StitchdSubscription!

    "Tier entitlements for the current plan (AI caps, team slots, feature flags)."
    stitchdTierEntitlements: StitchdEntitlements!

    "Billing invoices, newest first."
    stitchdInvoices: [StitchdInvoice!]!

    "Card on file for recurring charges (null if none)."
    stitchdPaymentMethod: StitchdPaymentMethod
  }

  extend type Mutation {
    "Start a paid subscription (Starter|Pro). Returns the Paystack authorization URL to add a card."
    startStitchdSubscription(tier: String!): StitchdBillingIntent!

    "Upgrade/downgrade tier (re-authorizes on the new plan)."
    changeStitchdTier(tier: String!): StitchdBillingIntent!

    "Get a link to update the card on file."
    updateStitchdPaymentMethod: StitchdBillingIntent!

    "Cancel the subscription (effective at period end)."
    cancelStitchdSubscription: StitchdSubscription!
  }

  type StitchdSubscription {
    tier: String!
    status: String!
    billingCycle: String!
    trialEndsAt: DateTime
    currentPeriodEnd: DateTime
    graceEndsAt: DateTime
    hasSubscription: Boolean!
  }

  type StitchdEntitlements {
    tier: String!
    priceNgn: Int!
    "null = unlimited"
    aiFitConsultantCap: Int
    aiTranscriptionCap: Int
    aiDesignCap: Int
    teamMemberSlots: Int
    teamMembers: Boolean!
    designGenerator: Boolean!
    briefExtractor: Boolean!
    socialPost: Boolean!
  }

  type StitchdInvoice {
    id: ID!
    amount: Float!
    currency: String!
    status: String!
    tier: String
    periodStart: DateTime
    periodEnd: DateTime
    paidAt: DateTime
    hostedUrl: String
    createdAt: DateTime
  }

  type StitchdPaymentMethod {
    id: ID!
    cardBrand: String
    last4: String
    expMonth: String
    expYear: String
    isDefault: Boolean!
  }

  "What the app opens to authorize a card / manage the subscription."
  type StitchdBillingIntent {
    authorizationUrl: String
    reference: String
    tier: String
  }
`;

export default stitchdBillingTypeDefs;
