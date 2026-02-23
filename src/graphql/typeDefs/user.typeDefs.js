import gql from 'graphql-tag';

const userTypeDefs = gql`
  type User {
    id: ID!
    fullName: String!
    email: String!
    phone: String
    dateOfBirth: DateTime
    gender: String
    age: Int
    height: Height
    preferences: UserPreferences
    profilePhoto: ProfilePhoto
    deliveryDetails: DeliveryDetails
    paymentMethods: [PaymentMethod!]
    subscriptionStatus: String
    currentSubscription: ID
    accountStatus: String!
    onboardingCompleted: Boolean
    onboardingStep: Int
    birthdayPackageEligible: Boolean
    lastLoginAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Height {
    value: Float
    unit: String
    source: String
  }

  type UserPreferences {
    styles: [String!]
    colors: [String!]
    fabrics: [String!]
    lifestyle: String
  }

  type DeliveryDetails {
    address: String
    phone: String
    landmark: String
    nearestBusStop: String
  }

  type PaymentMethod {
    type: String
    isDefault: Boolean
    provider: String
    last4: String
    expiryMonth: Int
    expiryYear: Int
  }

  type ProfilePhoto {
    url: String!
  }

  input ProfilePhotoInput {
    url: String!
  }

  type OnboardingStatus {
    completed: Boolean!
    step:      Int!
  }

  type UserConnection {
    nodes: [User!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    # User queries
    me: User
    onboardingStatus: OnboardingStatus!
    user(id: ID!): User
    users(
      filter: UserFilterInput
      pagination: PaginationInput
    ): UserConnection!
  }

  extend type Mutation {
    # User mutations
    updateProfile(input: UpdateProfileInput!): User!
    updateDeliveryDetails(input: DeliveryDetailsInput!): User!
    updatePreferences(input: UserPreferencesInput!): User!
    completeOnboardingStep(step: Int!, data: JSON): User!
    uploadProfilePhoto(base64: String!, mimeType: String): User!
    deactivateAccount: DeleteResult!
  }

  input UserFilterInput {
    accountStatus: String
    subscriptionStatus: String
    isActivated: Boolean
    onboardingCompleted: Boolean
  }

  input UpdateProfileInput {
    fullName: String
    phone: String
    dateOfBirth: DateTime
    gender: String
    height: HeightInput
    profilePhoto: ProfilePhotoInput
  }

  input HeightInput {
    value: Float!
    unit: String!
    source: String
  }

  input DeliveryDetailsInput {
    address: String!
    phone: String!
    landmark: String
    nearestBusStop: String
  }

  input UserPreferencesInput {
    styles: [String!]
    colors: [String!]
    fabrics: [String!]
    lifestyle: String
  }
`;

export default userTypeDefs;
