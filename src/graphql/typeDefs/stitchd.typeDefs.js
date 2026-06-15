import gql from 'graphql-tag';

/**
 * Stitchd (multi-tenant SaaS) namespaced GraphQL surface.
 *
 * Per doc 01 (Architecture & Multi-tenancy) §5, Stitchd gets its own namespaced
 * `stitchd*` typeDefs/resolvers so its schema stays legible and never accidentally
 * couples to the Vicelle internal types. A base `type Query` already exists in
 * `typeDefs/index.js`, so we `extend type Query` here rather than redeclaring the root.
 *
 * Batch 00 ships only a public health probe (`stitchdPing`) to prove the surface is
 * wired end-to-end before any entities exist. The tenant-scoped entity types
 * (StitchdCustomer, StitchdMeasurementSet, StitchdOrder, StitchdPayment,
 * StitchdThread, …) and their queries/mutations land in batch 01.
 */
const stitchdTypeDefs = gql`
  extend type Query {
    """
    Public health probe for the Stitchd namespaced surface. No auth required.
    Returns a small constant string proving the schema is registered and wired.
    """
    stitchdPing: String
  }
`;

export default stitchdTypeDefs;
