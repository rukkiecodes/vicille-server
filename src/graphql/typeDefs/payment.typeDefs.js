import gql from 'graphql-tag';

const paymentTypeDefs = gql`
  # ── Types ──────────────────────────────────────────────────────────────────

  type Payment {
    id:                   ID!
    transactionReference: String
    status:               String!
    amount:               Float
    currency:             String
    paidAt:               DateTime
    providerRef:          String
    paymentId:            ID
  }

  type SubscriptionPaymentInit {
    redirectUrl: String!
    reference:   String!
    paymentId:   ID!
  }

  type SubscriptionResult {
    subscriptionId: ID!
    paymentId:      ID!
    status:         String!
    message:        String
  }

  type PaymentMethod {
    id:                  ID!
    type:                String!
    cardLast4:           String
    cardBrand:           String
    bankName:            String
    accountName:         String
    authorizationStatus: String!
    isDefault:           Boolean!
    createdAt:           DateTime
  }

  type NigeriaBank {
    name: String!
    code: String!
  }

  type NigeriaAccountVerification {
    accountName: String!
    accountNumber: String!
    bankCode: String!
  }

  type PaymentConnection {
    nodes:    [Payment!]!
    pageInfo: PageInfo!
  }

  # ── Inputs ──────────────────────────────────────────────────────────────────

  input CardInput {
    number: String!
    expiry: String!
    cvv:    String!
    name:   String!
  }

  input PaymentFilterInput {
    status:      String
    paymentType: String
    user:        ID
    order:       ID
  }

  # ── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    payment(id: ID!):                       Payment
    paymentByReference(reference: String!): Payment
    payments(
      filter:     PaymentFilterInput
      pagination: PaginationInput
    ): PaymentConnection!
    myPayments(pagination: PaginationInput): PaymentConnection!
    myPaymentMethods: [PaymentMethod!]!
    nigeriaBanks: [NigeriaBank!]!
  }

  # ── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    # PayPal: collect card natively, vault + charge in one call
    subscribeWithCard(planId: ID!, card: CardInput!): SubscriptionResult!

    # Legacy Paystack: open checkout URL in browser
    initializeSubscriptionPayment(planId: ID!, callbackUrl: String): SubscriptionPaymentInit!
    verifyPayment(reference: String!):                Payment!
    refundPayment(id: ID!, amount: Float, reason: String): Payment!
    verifyNigeriaBankAccount(bankCode: String!, accountNumber: String!): NigeriaAccountVerification!
  }
`;

export default paymentTypeDefs;
