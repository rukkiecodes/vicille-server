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

  # Returned by initializeSubscriptionPayment — open redirectUrl in a WebView.
  # After the user completes payment, Paystack fires webhooks that activate the subscription.
  type SubscriptionPaymentInit {
    redirectUrl: String!
    reference:   String!
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

  type CustomerPaymentTransaction {
    reference:  String
    status:     String!
    amountKobo: Int!
    amountNgn:  Float!
    currency:   String!
    channel:    String
    paidAt:     DateTime
    createdAt:  DateTime
  }

  type NigeriaBank {
    name: String!
    code: String!
  }

  type NigeriaAccountVerification {
    accountName:   String!
    accountNumber: String!
    bankCode:      String!
  }

  type PaymentConnection {
    nodes:    [Payment!]!
    pageInfo: PageInfo!
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
    myPaystackTransactions(limit: Int = 50, page: Int = 1): [CustomerPaymentTransaction!]!
    myPaymentMethods:                       [PaymentMethod!]!
    nigeriaBanks:                           [NigeriaBank!]!
  }

  # ── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    # Card subscription via Paystack hosted checkout.
    # Creates a pending subscription record and returns the Paystack payment URL.
    # The subscription becomes active once the payment webhook fires.
    initializeSubscriptionPayment(planId: ID!, callbackUrl: String): SubscriptionPaymentInit!

    verifyPayment(reference: String!):                              Payment!
    refundPayment(id: ID!, amount: Float, reason: String):          Payment!
    verifyNigeriaBankAccount(bankCode: String!, accountNumber: String!): NigeriaAccountVerification!
  }
`;

export default paymentTypeDefs;
