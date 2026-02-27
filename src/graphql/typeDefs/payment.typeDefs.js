import gql from 'graphql-tag';

const paymentTypeDefs = gql`
  # ── Types ──────────────────────────────────────────────────────────────────

  type Payment {
    id:                 ID!
    transactionReference: String
    status:             String!
    amount:             Float
    currency:           String
    paidAt:             DateTime
    providerRef:        String
    paymentId:          ID
  }

  type SubscriptionPaymentInit {
    redirectUrl: String!
    reference:   String!
    paymentId:   ID!
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

  type PaymentConnection {
    nodes:    [Payment!]!
    pageInfo: PageInfo!
  }

  # ── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    payment(id: ID!):                    Payment
    paymentByReference(reference: String!): Payment
    payments(
      filter:     PaymentFilterInput
      pagination: PaginationInput
    ): PaymentConnection!
    myPayments(pagination: PaginationInput): PaymentConnection!
    myPaymentMethods: [PaymentMethod!]!
    resolveAccount(accountNumber: String!, bankCode: String!): ResolvedAccount
  }

  type ResolvedAccount {
    accountName:   String!
    accountNumber: String!
  }

  # ── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    initializeSubscriptionPayment(planId: ID!, input: DirectDebitInput): SubscriptionPaymentInit!
    verifyPayment(reference: String!):          Payment!
    refundPayment(id: ID!, amount: Float, reason: String): Payment!
  }

  # ── Inputs ──────────────────────────────────────────────────────────────────

  input PaymentFilterInput {
    status:      String
    paymentType: String
    user:        ID
    order:       ID
  }

  input DirectDebitInput {
    accountNumber: String!
    bankCode:      String!
    addressStreet: String!
    addressCity:   String!
    addressState:  String!
  }
`;

export default paymentTypeDefs;
