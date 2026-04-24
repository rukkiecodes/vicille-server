import gql from 'graphql-tag';

const subscriptionTypeDefs = gql`
  type SubscriptionPlan {
    id: ID!
    name: String!
    slug: String
    description: String
    pricing: SubscriptionPricing
    features: SubscriptionFeatures
    stylingWindow: PlanStylingWindow
    isActive: Boolean
    displayOrder: Int
    formattedPrice: String
    referralRewardNgn: Float
    paystackPlanCode: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SubscriptionPricing {
    amount: Float!
    currency: String
    billingCycle: String
    trialDays: Int
  }

  type SubscriptionFeatures {
    fitsPerCycle: Int
    itemsPerFit: Int
    itemsPerCycle: Int
    fabricOptions: [String!]
    styleConsultation: Boolean
    prioritySupport: Boolean
    freeAlterations: Int
    accessoryDiscount: Float
  }

  type PlanStylingWindow {
    daysBeforeProduction: Int
    reminderDays: [Int!]
  }

  type UserSubscription {
    id: ID!
    user: ID!
    plan: ID!
    status: String!
    paymentStatus: String
    billing: SubscriptionBilling
    currentCycle: SubscriptionCycle
    cancellation: JSON
    startDate: DateTime
    endDate: DateTime
    isActive: Boolean
    isStylingWindowOpen: Boolean
    daysUntilNextBilling: Int
    paystackSubscriptionCode: String
    paymentChannel: String
    renewalEnabled: Boolean
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    planDetails: SubscriptionPlan
    userDetails: User
    fitsUsedThisCycle: Int!
    fitsRemainingThisCycle: Int!
  }

  # Returned by initializeCardSubscription — open authorizationUrl in browser to complete payment.
  type CardSubscriptionInit {
    authorizationUrl: String!
    reference:        String!
    subscriptionId:   ID!
  }

  type SubscriptionManageLink {
    link: String!
  }

  type SubscriptionBilling {
    nextBillingDate: DateTime
    lastBillingDate: DateTime
    failedAttempts: Int
    gracePeriodEnd: DateTime
  }

  type SubscriptionCycle {
    cycleNumber: Int
    stylingWindowOpen: DateTime
    stylingWindowClose: DateTime
    productionStart: DateTime
    estimatedDelivery: DateTime
  }

  type SubscriptionPlanConnection {
    nodes: [SubscriptionPlan!]!
    pageInfo: PageInfo!
  }

  type UserSubscriptionConnection {
    nodes: [UserSubscription!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    # Subscription Plans
    subscriptionPlan(id: ID!): SubscriptionPlan
    subscriptionPlans(activeOnly: Boolean): [SubscriptionPlan!]!

    # User Subscriptions
    subscription(id: ID!): UserSubscription
    mySubscription: UserSubscription
    subscriptions(
      filter: SubscriptionFilterInput
      pagination: PaginationInput
    ): UserSubscriptionConnection!
  }

  extend type Mutation {
    # Subscription Plans (admin)
    createSubscriptionPlan(input: CreateSubscriptionPlanInput!): SubscriptionPlan!
    updateSubscriptionPlan(id: ID!, input: UpdateSubscriptionPlanInput!): SubscriptionPlan!
    deactivateSubscriptionPlan(id: ID!): SubscriptionPlan!

    # User Subscriptions
    # initializeCardSubscription: creates a pending subscription + returns Paystack hosted payment URL.
    # User must open authorizationUrl, complete payment, and the webhook/callback activates the sub.
    initializeCardSubscription(planId: ID!): CardSubscriptionInit!
    initializeCardSubscriptionByCode(planCode: String!): CardSubscriptionInit!
    cancelSubscription(reason: String): UserSubscription!
    pauseSubscription: UserSubscription!
    resumeSubscription: UserSubscription!
    getSubscriptionManageLink: SubscriptionManageLink!
    sendSubscriptionManageEmail: Boolean!
  }

  input SubscriptionFilterInput {
    status: String
    paymentStatus: String
    user: ID
    plan: ID
  }

  input CreateSubscriptionPlanInput {
    name: String!
    slug: String
    description: String
    pricing: SubscriptionPricingInput!
    features: SubscriptionFeaturesInput
    stylingWindow: PlanStylingWindowInput
    displayOrder: Int
  }

  input UpdateSubscriptionPlanInput {
    name: String
    description: String
    pricing: SubscriptionPricingInput
    features: SubscriptionFeaturesInput
    stylingWindow: PlanStylingWindowInput
    isActive: Boolean
    displayOrder: Int
  }

  input SubscriptionPricingInput {
    amount: Float!
    currency: String
    billingCycle: String!
    trialDays: Int
  }

  input SubscriptionFeaturesInput {
    fitsPerCycle: Int
    itemsPerFit: Int
    itemsPerCycle: Int
    fabricOptions: [String!]
    styleConsultation: Boolean
    prioritySupport: Boolean
    freeAlterations: Int
    accessoryDiscount: Float
  }

  input PlanStylingWindowInput {
    daysBeforeProduction: Int
    reminderDays: [Int!]
  }
`;

export default subscriptionTypeDefs;
