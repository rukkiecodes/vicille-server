import gql from 'graphql-tag';

/**
 * Stitchd customer GraphQL surface (batch 02).
 *
 * Tailor-owned, tenant-scoped customer book (spec §5.2, §7.3). Namespaced `stitchd*`
 * (doc 01 §5) and `extend`s the root Query/Mutation. Every operation is wrapped by the
 * `requireTailor` guard and scoped by the resolved tailorId — a tailor never sees another
 * tailor's customers (spec §2.5).
 *
 * `DateTime`/`Date` semantics: `dob` is a calendar date, carried as a String (ISO
 * `YYYY-MM-DD`) to avoid timezone drift; timestamps use the existing DateTime scalar.
 */
const stitchdCustomerTypeDefs = gql`
  extend type Query {
    "Tenant-scoped, paginated customer list with search/filter/sort."
    stitchdCustomers(
      search: String
      filter: StitchdCustomerFilter = ALL
      sort: StitchdCustomerSort = RECENT
      page: Int = 1
      pageSize: Int = 50
    ): StitchdCustomerPage!

    "A single customer (with stats) owned by the authenticated tailor; null if not theirs."
    stitchdCustomer(id: ID!): StitchdCustomer

    "Distinct tag labels the tailor has used — powers the customer-list filter bar (batch 13)."
    stitchdTags: [StitchdTagPreset!]!

    "Customers whose birthday is today (WAT) — for the in-app birthday reminder (batch 13)."
    stitchdBirthdaysToday: [StitchdBirthday!]!
  }

  extend type Mutation {
    "Create a customer. Accepts a client-generated id (offline-first); idempotent on it."
    createStitchdCustomer(input: CreateStitchdCustomerInput!): StitchdCustomer!

    "Update an existing customer owned by the authenticated tailor."
    updateStitchdCustomer(id: ID!, input: UpdateStitchdCustomerInput!): StitchdCustomer!

    "Add a colour-coded tag to a customer (idempotent on label) (batch 13)."
    addStitchdCustomerTag(customerId: ID!, label: String!, color: String): StitchdCustomerTag!

    "Remove a customer tag by id (batch 13)."
    removeStitchdCustomerTag(id: ID!): Boolean!
  }

  enum StitchdCustomerFilter {
    ALL
    OWES      # owes money (balance > 0) — wired with payments in batch 05
    RECENT    # added recently
  }

  enum StitchdCustomerSort {
    RECENT    # most recently added first
    AZ        # alphabetical by name
    ORDERS    # most orders first (wired in batch 04)
    SPENT     # most spent first (wired in batch 05)
  }

  type StitchdCustomer {
    id: ID!
    name: String!
    phone: String
    secondaryPhone: String
    email: String
    profilePhoto: String
    fullBodyPhoto: String
    dob: String              # ISO calendar date YYYY-MM-DD
    address: String
    landmark: String
    notes: String
    createdAt: DateTime
    updatedAt: DateTime

    # Computed stats (zero-safe until orders/payments exist — batches 04/05)
    totalOrders: Int!
    totalSpent: Float!
    owedAmount: Float!
    lastOrderDate: DateTime

    "Colour-coded segmentation tags (batch 13)."
    tags: [StitchdCustomerTag!]!

    "Preferred channel (whatsapp|sms) + WhatsApp auto-notify opt-in (batches 18/21)."
    preferredChannel: String!
    waAutoOptin: Boolean!
  }

  type StitchdCustomerTag {
    id: ID!
    customerId: ID!
    label: String!
    color: String
    createdAt: DateTime
  }

  type StitchdTagPreset {
    label: String!
    color: String
  }

  type StitchdBirthday {
    id: ID!
    name: String!
    phone: String
    profilePhoto: String
    dob: String
  }

  type StitchdCustomerPage {
    items: [StitchdCustomer!]!
    page: Int!
    pageSize: Int!
    total: Int!
  }

  input CreateStitchdCustomerInput {
    "Optional client-generated UUID for offline-first idempotent capture (doc 01 §8)."
    id: ID
    name: String!
    phone: String
    secondaryPhone: String
    email: String
    profilePhoto: String
    fullBodyPhoto: String
    dob: String
    address: String
    landmark: String
    notes: String
  }

  input UpdateStitchdCustomerInput {
    name: String
    phone: String
    secondaryPhone: String
    email: String
    profilePhoto: String
    fullBodyPhoto: String
    dob: String
    address: String
    landmark: String
    notes: String
  }
`;

export default stitchdCustomerTypeDefs;
