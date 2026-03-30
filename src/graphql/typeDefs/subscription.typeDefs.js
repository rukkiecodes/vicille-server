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
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    planDetails: SubscriptionPlan
    userDetails: User
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
    subscribe(planId: ID!): UserSubscription!
    cancelSubscription(reason: String): UserSubscription!
    pauseSubscription: UserSubscription!
    resumeSubscription: UserSubscription!
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
