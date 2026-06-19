import gql from 'graphql-tag';

/**
 * Stitchd Home Dashboard GraphQL surface (batch 07, spec §7.2).
 *
 * The morning operating surface: due-this-week count, outstanding total, this-week
 * paid/pending, monthly revenue trend, and a recent-activity feed. Namespaced `stitchd*`,
 * tenant-scoped via `requireTailor`. `monthlyTrend` reuses `StitchdMoneyTrendPoint` (batch
 * 05) so Home and Money share one definition (parity guarantee).
 */
const stitchdDashboardTypeDefs = gql`
  extend type Query {
    "Aggregates for the Home dashboard (due this week, outstanding, this-week earnings, trend, recent activity)."
    stitchdHomeDashboard(weekStart: String): StitchdHomeDashboard!
  }

  type StitchdActivityItem {
    "Stable id of the underlying row (order/payment/customer)."
    id: ID!
    "order | payment | customer"
    kind: String!
    "Primary label — the customer's name."
    label: String!
    "Order number for order activity; null otherwise."
    ref: String
    "Amount for payment activity (NGN); null otherwise."
    amount: Float
    customerId: ID
    orderId: ID
    ts: DateTime
  }

  type StitchdHomeDashboard {
    weekStart: String!
    "Open orders due inside the current week."
    dueThisWeekCount: Int!
    outstandingTotal: Float!
    outstandingCustomerCount: Int!
    "This-week collected — equals the Money dashboard for the same week."
    thisWeekPaid: Float!
    "This-week balance still owed on orders due this week."
    thisWeekPending: Float!
    monthlyTrend: [StitchdMoneyTrendPoint!]!
    "Last 5 events across orders/payments/customers, newest-first."
    recentActivity: [StitchdActivityItem!]!
  }
`;

export default stitchdDashboardTypeDefs;
