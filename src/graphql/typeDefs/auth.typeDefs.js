import gql from 'graphql-tag';

const authTypeDefs = gql`
  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User
    tailor: Tailor
    admin: Admin
    type: String!
  }

  type RefreshPayload {
    accessToken: String!
    refreshToken: String!
  }

  type MessageResult {
    success: Boolean!
    message: String!
  }

  type TailorForgotPasswordResult {
    success: Boolean!
    message: String!
    resetToken: String!
  }

  extend type Mutation {
    # Client auth — invite-only, passcode based
    clientLogin(email: String!, passcode: String!): AuthPayload!
    clientForgotPasscode(email: String!): MessageResult!

    # Tailor auth — self-signup, email/password
    tailorSignup(input: TailorSignupInput!): AuthPayload!
    tailorLogin(email: String!, password: String!): AuthPayload!
    tailorForgotPassword(email: String!): TailorForgotPasswordResult!
    tailorResetPassword(token: String!, newPassword: String!): Boolean!

    # Admin auth — email/password
    adminLogin(email: String!, password: String!): AuthPayload!

    # Token refresh
    refreshToken(refreshToken: String!): RefreshPayload!
  }

  input TailorSignupInput {
    fullName: String!
    email: String!
    phone: String!
    password: String!
    specialties: [SpecialtyInput!]
  }

  input SpecialtyInput {
    category: String!
    proficiencyLevel: String
    yearsExperience: Int
  }
`;

export default authTypeDefs;
