import gql from 'graphql-tag';

const walletTypeDefs = gql`
  # ── Types ─────────────────────────────────────────────────────────────────

  type Wallet {
    id:               ID!
    userId:           ID!
    balanceKobo:      Int!
    balanceNgn:       Float!
    currency:         String!
    dvaAssigned:      Boolean!
    dvaAccountNumber: String
    dvaAccountName:   String
    dvaBankName:      String
    dvaBankSlug:      String
    dvaAssignedAt:    DateTime
    createdAt:        DateTime!
    updatedAt:        DateTime!
  }

  type WalletTransaction {
    id:                ID!
    walletId:          ID!
    userId:            ID!
    type:              String!
    direction:         String!
    amountKobo:        Int!
    amountNgn:         Float!
    balanceBefore:     Int!
    balanceAfter:      Int!
    status:            String!
    paystackReference: String
    paystackChannel:   String
    description:       String
    createdAt:         DateTime!
  }

  type SavedCard {
    id:        ID!
    userId:    ID!
    last4:     String
    bin:       String
    expMonth:  String
    expYear:   String
    cardType:  String
    bank:      String
    brand:     String
    channel:   String!
    isDefault: Boolean!
    createdAt: DateTime!
  }

  type WalletTopUpInit {
    authorizationUrl: String!
    reference:        String!
  }

  type WalletTransactionConnection {
    nodes:    [WalletTransaction!]!
    pageInfo: PageInfo!
  }

  # ── Queries ────────────────────────────────────────────────────────────────

  extend type Query {
    myWallet:                                           Wallet
    myWalletTransactions(pagination: PaginationInput):  WalletTransactionConnection!
    mySavedCards:                                       [SavedCard!]!
  }

  # ── Mutations ──────────────────────────────────────────────────────────────

  extend type Mutation {
    # Fund wallet via Paystack-hosted card payment — returns URL to open in browser.
    initializeWalletTopUp(amountKobo: Int!, callbackUrl: String): WalletTopUpInit!

    # Fund wallet by charging an already-saved card (no redirect needed).
    chargeWalletWithCard(cardId: ID!, amountKobo: Int!): WalletTopUpInit!

    # Request a Dedicated Virtual Account (bank-transfer funding).
    # The account arrives async via webhook — poll myWallet.dvaAssigned after calling.
    requestWalletDva: Wallet!

    # Saved cards
    setDefaultCard(cardId: ID!): SavedCard!
    deleteCard(cardId: ID!):     Boolean!
  }
`;

export default walletTypeDefs;
