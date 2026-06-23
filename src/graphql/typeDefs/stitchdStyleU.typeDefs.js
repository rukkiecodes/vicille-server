import gql from 'graphql-tag';

/**
 * Stitchd-side Style-U marketplace GraphQL (batch 20). Tenant-scoped. The Style-U-side ingestion
 * (enqueueOffer / vetting / delivery / payout-paid) is the internal service-key route, not here.
 */
const stitchdStyleUTypeDefs = gql`
  extend type Query {
    stitchdStyleUConnection: StitchdStyleUConnection!
    stitchdStyleUInbox: [StitchdStyleUOffer!]!
    stitchdStyleUOffer(id: ID!): StitchdStyleUOffer
    stitchdStyleUPayouts: [StitchdStyleUPayout!]!
    stitchdStyleUMetrics: StitchdStyleUMetrics!
  }

  extend type Mutation {
    applyToStyleU(specialties: [String!], capacityOptin: Boolean): StitchdStyleUConnection!
    setStyleUCapacityOptin(optin: Boolean!): StitchdStyleUConnection!
    disconnectFromStyleU: StitchdStyleUConnection!
    "Accept an offer → creates a source='style-u' queue order. Idempotent."
    acceptStyleUOffer(offerId: ID!): StitchdOrder!
    declineStyleUOffer(offerId: ID!, reason: String): Boolean!
  }

  type StitchdStyleUConnection {
    status: String!            # not_connected | pending_vetting | approved | rejected | suspended
    specialties: [String!]!
    capacityOptin: Boolean!
    appliedAt: DateTime
    vettedAt: DateTime
  }

  type StitchdStyleUOffer {
    id: ID!
    styleuOrderRef: String!
    garmentSummary: String!
    details: JSON
    dueDate: String
    payoutAmount: Float!
    currency: String!
    respondBy: DateTime
    status: String!            # pending | accepted | declined | expired
    orderId: ID
    createdAt: DateTime
  }

  type StitchdStyleUPayout {
    id: ID!
    orderId: ID
    styleuOrderRef: String!
    amount: Float!
    currency: String!
    status: String!            # pending | released | paid
    deliveredAt: DateTime
    paidAt: DateTime
  }

  type StitchdStyleUMetrics {
    rating: Float
    onTimeRate: Float
    acceptRate: Float
    completedCount: Int!
  }
`;

export default stitchdStyleUTypeDefs;
