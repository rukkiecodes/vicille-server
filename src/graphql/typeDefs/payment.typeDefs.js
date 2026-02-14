import gql from 'graphql-tag';

const paymentTypeDefs = gql`
  type Payment {
    id: ID!
    transactionReference: String!
    user: ID!
    order: ID
    subscription: ID
    paymentType: String!
    amount: Float!
    currency: String
    paymentMethod: JSON
    status: String!
    providerReference: String
    providerResponse: JSON
    metadata: JSON
    refund: JSON
    formattedAmount: String
    isPaid: Boolean
    canRetry: Boolean
    retryCount: Int
    paidAt: DateTime
    failedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    userDetails: User
  }

  type PaymentConnection {
    nodes: [Payment!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    payment(id: ID!): Payment
    paymentByReference(reference: String!): Payment
    payments(
      filter: PaymentFilterInput
      pagination: PaginationInput
    ): PaymentConnection!
    myPayments(pagination: PaginationInput): PaymentConnection!
  }

  extend type Mutation {
    initializePayment(input: InitializePaymentInput!): Payment!
    verifyPayment(reference: String!): Payment!
    retryPayment(id: ID!): Payment!
    refundPayment(id: ID!, amount: Float, reason: String): Payment!
  }

  input PaymentFilterInput {
    status: String
    paymentType: String
    user: ID
    order: ID
  }

  input InitializePaymentInput {
    order: ID
    subscription: ID
    paymentType: String!
    amount: Float!
    currency: String
    paymentMethod: JSON
  }
`;

export default paymentTypeDefs;
