import gql from 'graphql-tag';

/**
 * Stitchd account lifecycle GraphQL surface (batch 15) — data export + account deletion.
 * Namespaced, tenant-scoped via `requireTailor`. (In-app support is WhatsApp-based, no vendor;
 * marketing site is a separate web project.)
 */
const stitchdAccountTypeDefs = gql`
  extend type Query {
    "Full-account CSV export (customers, orders, payments)."
    stitchdDataExport: StitchdDataExport!

    "The current active account-deletion request (null if none)."
    stitchdAccountDeletion: StitchdAccountDeletion
  }

  extend type Mutation {
    "Request account deletion: emails a data takeout, opens a cancelable grace window, then purges."
    requestStitchdAccountDeletion: StitchdAccountDeletion!

    "Cancel a pending account-deletion request."
    cancelStitchdAccountDeletion: Boolean!
  }

  type StitchdDataExport {
    filename: String!
    mimeType: String!
    csv: String!
  }

  type StitchdAccountDeletion {
    id: ID!
    status: String!            # requested | archived | purged | canceled
    requestedAt: DateTime
    scheduledPurgeAt: DateTime
    archiveEmailedAt: DateTime
  }
`;

export default stitchdAccountTypeDefs;
