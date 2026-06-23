import gql from 'graphql-tag';

/**
 * Stitchd enterprise GraphQL surface (batch 17) — READ-mostly for the tenant. Admin actions
 * (entitlements, account, invoices) are ops-driven via the internal service-key route, not the
 * tailor app. Locations are tenant-managed (team:manage) behind the multi-location flag.
 */
const stitchdEnterpriseTypeDefs = gql`
  extend type Query {
    "Effective entitlements (caps + flags) for the tenant — overrides applied (batch 17)."
    stitchdEntitlementsResolved: StitchdResolvedEntitlements!
    "Enterprise account / contract terms (null if not an enterprise tenant)."
    stitchdEnterpriseAccount: StitchdEnterpriseAccount
    "B2B invoices (the enterprise's bill from Stitchd)."
    stitchdEnterpriseInvoices: [StitchdEnterpriseInvoice!]!
    "Locations under this tenant (multi-location)."
    stitchdLocations: [StitchdLocation!]!
  }

  extend type Mutation {
    "Create a location (needs team:manage; multi-location tenants)."
    createStitchdLocation(name: String!, address: String, isPrimary: Boolean): StitchdLocation!
    "Assign a team member to a location (needs team:manage)."
    assignStitchdMemberToLocation(memberId: ID!, locationId: ID): Boolean!
  }

  type StitchdResolvedEntitlements {
    tier: String!
    teamSeatCap: Int           # null = unlimited
    multiLocation: Boolean!
    aiFitConsultantCap: Int    # null = unlimited
    aiDesignCap: Int
    aiTranscriptionCap: Int
  }

  type StitchdEnterpriseAccount {
    id: ID!
    accountManagerName: String
    accountManagerContact: String
    contractStart: String
    contractEnd: String
    customPriceAmount: Float
    currency: String!
    billingTerms: String
    billingCycle: String!
    notes: String
  }

  type StitchdEnterpriseInvoice {
    id: ID!
    number: String
    periodStart: String
    periodEnd: String
    amount: Float!
    currency: String!
    status: String!            # draft | issued | paid | void
    issuedAt: DateTime
    dueAt: DateTime
    paidAt: DateTime
    pdfUrl: String
    createdAt: DateTime
  }

  type StitchdLocation {
    id: ID!
    name: String!
    address: String
    isPrimary: Boolean!
  }
`;

export default stitchdEnterpriseTypeDefs;
