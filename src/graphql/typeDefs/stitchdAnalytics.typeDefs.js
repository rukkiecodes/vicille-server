import gql from 'graphql-tag';

/**
 * Stitchd analytics GraphQL surface (batch 14). Live per-tenant aggregates; namespaced and
 * tenant-scoped via `requireTailor`. Money fields are Float (NGN, gross collected).
 */
const stitchdAnalyticsTypeDefs = gql`
  extend type Query {
    "Monthly collected revenue for the last N months (gap-filled, oldest→newest)."
    stitchdMonthlyRevenue(months: Int = 6): [StitchdRevenuePoint!]!

    "Top customers by collected spend."
    stitchdTopCustomers(limit: Int = 10): [StitchdCustomerSpend!]!

    "Best-selling garment types by order-item revenue."
    stitchdBestSellingGarments(limit: Int = 8): [StitchdGarmentRevenue!]!

    "Customers with at least one order but none in daysThreshold+ days."
    stitchdDormantCustomers(daysThreshold: Int = 90): [StitchdDormantCustomer!]!

    "CSV export of the analytics summary (PDF via data-portal is deferred)."
    stitchdAnalyticsExport: StitchdAnalyticsExport!
  }

  type StitchdRevenuePoint {
    month: String!     # YYYY-MM
    gross: Float!
    count: Int!
  }

  type StitchdCustomerSpend {
    customerId: ID!
    name: String!
    profilePhoto: String
    totalSpend: Float!
    orderCount: Int!
  }

  type StitchdGarmentRevenue {
    garmentType: String!
    revenue: Float!
    qty: Int!
  }

  type StitchdDormantCustomer {
    id: ID!
    name: String!
    phone: String
    profilePhoto: String
    lastOrderDate: DateTime
    daysSince: Int
  }

  type StitchdAnalyticsExport {
    filename: String!
    mimeType: String!
    csv: String!
  }
`;

export default stitchdAnalyticsTypeDefs;
