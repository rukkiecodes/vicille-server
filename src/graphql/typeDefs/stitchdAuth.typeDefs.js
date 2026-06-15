import gql from 'graphql-tag';

/**
 * Stitchd auth & onboarding GraphQL surface (batch 01).
 *
 * Phone-OTP tailor signup + multi-tenant onboarding. Namespaced under `stitchd*`
 * so it never couples to the Vicelle internal types. `extend`s the root Query/Mutation
 * (defined in typeDefs/index.js). The `DateTime` scalar already exists in the schema.
 */
const stitchdAuthTypeDefs = gql`
  extend type Query {
    "Current authenticated tailor's profile; null if not a Stitchd tailor."
    stitchdTailor: StitchdTailor
  }

  extend type Mutation {
    "Request an OTP for a phone number. Returns devCode only when no SMS provider is configured."
    requestStitchdOtp(phone: String!): StitchdOtpResult!

    "Verify an OTP. Creates the tenant on first verification; always returns auth tokens."
    verifyStitchdOtp(phone: String!, code: String!): StitchdAuthPayload!

    "Complete / update the authenticated tailor's business profile."
    completeStitchdBusinessProfile(input: StitchdBusinessProfileInput!): StitchdTailor!
  }

  type StitchdTailor {
    id: ID!
    phone: String
    businessName: String
    ownerName: String
    locationCity: String
    locationArea: String
    specialties: [String!]
    logoUrl: String
    ownerPhotoUrl: String
    subscriptionStatus: String!   # trial|active|past_due|canceled
    tier: String!                 # starter|pro|enterprise
    trialEndsAt: DateTime
    profileComplete: Boolean!
    createdAt: DateTime
  }

  type StitchdOtpResult {
    success: Boolean!
    message: String!
    expiresInSeconds: Int
    devCode: String               # populated ONLY when no SMS provider is configured
  }

  type StitchdAuthPayload {
    accessToken: String!
    refreshToken: String!
    type: String!                 # 'tailor'
    isNewTailor: Boolean!
    tailor: StitchdTailor!
  }

  input StitchdBusinessProfileInput {
    businessName: String!
    ownerName: String!
    locationCity: String!
    locationArea: String
    specialties: [String!]
    logoUrl: String
    ownerPhotoUrl: String
  }
`;

export default stitchdAuthTypeDefs;
