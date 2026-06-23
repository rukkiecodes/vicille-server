import gql from 'graphql-tag';

/**
 * Stitchd customer-portal + SMS GraphQL surface (batch 18) — the AUTHENTICATED (tenant) side.
 * The public read-only portal page is served by the /portal route, not this schema.
 */
const stitchdPortalTypeDefs = gql`
  extend type Query {
    "Portal links generated for an order."
    stitchdPortalLinks(orderId: ID!): [StitchdPortalLink!]!
    "SMS delivery log for a customer."
    stitchdSmsLog(customerId: ID!): [StitchdSmsEntry!]!
  }

  extend type Mutation {
    "Create a read-only portal link for an order (or a customer's open orders)."
    createStitchdPortalLink(orderId: ID, customerId: ID, scope: String, expiresAt: String): StitchdPortalLink!
    "Revoke a portal link."
    revokeStitchdPortalLink(id: ID!): Boolean!
    "Send a customer an SMS (Termii)."
    sendStitchdSms(customerId: ID!, body: String!): StitchdSmsEntry!
    "Set a customer's preferred channel (whatsapp|sms)."
    setStitchdCustomerChannelPref(customerId: ID!, channel: String!): String!
  }

  type StitchdPortalLink {
    id: ID!
    orderId: ID
    scope: String!
    url: String!
    revoked: Boolean!
    expiresAt: DateTime
    viewCount: Int!
    lastViewedAt: DateTime
    createdAt: DateTime
  }

  type StitchdSmsEntry {
    id: ID!
    toPhone: String!
    body: String
    status: String!
    sentAt: DateTime
  }
`;

export default stitchdPortalTypeDefs;
