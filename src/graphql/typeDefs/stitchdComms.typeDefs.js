import gql from 'graphql-tag';

/**
 * Stitchd WhatsApp Business API, B2B customer invoices, tax export & multi-currency (batch 21).
 * Tenant-scoped. WhatsApp sends + invoice issue + tax export are online-only. Subscription billing
 * stays NGN; the tenant currency applies to the tailor's OWN pricing/orders/invoices only.
 */
const stitchdCommsTypeDefs = gql`
  extend type Query {
    stitchdWaTemplates: [StitchdWaTemplate!]!
    stitchdCustomerInvoices: [StitchdCustomerInvoice!]!
    stitchdCurrency: String!
  }

  extend type Mutation {
    "Send an approved WhatsApp template to a customer."
    sendStitchdWaTemplate(customerId: ID!, key: String!, params: JSON): StitchdWaMessage!
    "Toggle a customer's WhatsApp auto-notify opt-in."
    setStitchdWaOptIn(customerId: ID!, enabled: Boolean!): Boolean!
    "Set the tenant's currency (the tailor's own pricing; billing stays NGN)."
    setStitchdCurrency(code: String!): String!

    createStitchdCustomerInvoice(input: StitchdCustomerInvoiceInput!): StitchdCustomerInvoice!
    issueStitchdCustomerInvoice(id: ID!): StitchdCustomerInvoice!
    markStitchdCustomerInvoicePaid(id: ID!): StitchdCustomerInvoice!
    voidStitchdCustomerInvoice(id: ID!): StitchdCustomerInvoice!

    "Generate a tax/VAT report (CSV) for a period — returns the file inline."
    requestStitchdTaxExport(from: String, to: String): StitchdTaxExport!
  }

  input StitchdInvoiceItemInput {
    description: String!
    quantity: Float!
    unitPrice: Float!
  }
  input StitchdCustomerInvoiceInput {
    customerId: ID
    items: [StitchdInvoiceItemInput!]!
    taxRate: Float
    notes: String
    dueAt: String
  }

  type StitchdWaTemplate {
    id: ID!
    key: String!
    body: String!
    variables: [String!]!
    category: String!
    approvalStatus: String!
    locale: String!
    isCustom: Boolean!
  }
  type StitchdWaMessage {
    id: ID!
    templateKey: String!
    status: String!
    sentAt: DateTime
  }
  type StitchdCustomerInvoice {
    id: ID!
    customerId: ID
    number: String!
    items: JSON!
    subtotal: Float!
    taxRate: Float!
    taxAmount: Float!
    total: Float!
    currency: String!
    status: String!
    notes: String
    issuedAt: DateTime
    dueAt: DateTime
    paidAt: DateTime
    pdfUrl: String
    createdAt: DateTime
  }
  type StitchdTaxExport {
    filename: String!
    mimeType: String!
    csv: String!
  }
`;

export default stitchdCommsTypeDefs;
