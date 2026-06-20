import gql from 'graphql-tag';

/**
 * Stitchd offline delta-sync surface (batch 08, doc 01 §8).
 *
 * `stitchdSyncPull` returns every record changed since the client's cursor (plus tombstoned
 * ids) so the local store refreshes without re-fetching whole lists. Reuses the existing
 * StitchdCustomer / StitchdOrder / StitchdPayment types. Namespaced, tenant-scoped via
 * `requireTailor`.
 */
const stitchdSyncTypeDefs = gql`
  extend type Query {
    "Pull records changed since the given cursor (null = full pull). Returns a new cursor."
    stitchdSyncPull(since: String): StitchdSyncPullResult!
  }

  type StitchdSyncPullResult {
    "Server timestamp to pass back as \`since\` on the next pull (avoids device clock skew)."
    cursor: String!
    customers: [StitchdCustomer!]!
    orders: [StitchdOrder!]!
    payments: [StitchdPayment!]!
    "Ids tombstoned since the cursor — remove these from the local store."
    deletedCustomerIds: [ID!]!
    deletedOrderIds: [ID!]!
  }
`;

export default stitchdSyncTypeDefs;
