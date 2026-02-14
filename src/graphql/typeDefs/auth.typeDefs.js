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

  extend type Mutation {
    # User auth (activation code based)
    requestActivationCode(email: String!, fullName: String, phone: String): RequestCodeResult!
    verifyActivationCode(email: String!, code: String!): AuthPayload!

    # Tailor auth (password based)
    tailorLogin(email: String!, password: String!): AuthPayload!
    tailorRegister(input: TailorRegisterInput!): AuthPayload!

    # Admin auth (password based)
    adminLogin(email: String!, password: String!): AuthPayload!

    # Token refresh
    refreshToken(refreshToken: String!): RefreshPayload!
  }

  type RequestCodeResult {
    success: Boolean!
    message: String!
  }

  input TailorRegisterInput {
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
