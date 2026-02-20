import gql from 'graphql-tag';

const adminTypeDefs = gql`
  type Admin {
    id: ID!
    fullName: String!
    email: String!
    phone: String
    role: String!
    permissions: [String!]
    profilePhoto: ProfilePhoto
    accountStatus: String!
    createdBy: String
    lastLoginAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AdminConnection {
    nodes: [Admin!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    admin(id: ID!): Admin
    admins(pagination: PaginationInput): AdminConnection!
    dashboardStats: DashboardStats!
  }

  type CreateClientResult {
    success: Boolean!
    message: String!
    user: User!
    passcode: String!
  }

  extend type Mutation {
    # Admin account management
    createAdmin(input: CreateAdminInput!): Admin!
    updateAdmin(id: ID!, input: UpdateAdminInput!): Admin!
    deleteAdmin(id: ID!): DeleteResult!

    # Client invitation (admin-only; passcode returned for record-keeping)
    createClientAccount(email: String!, fullName: String!, phone: String): CreateClientResult!

    # User account management
    suspendUser(userId: ID!, reason: String!): User!
    reactivateUser(userId: ID!): User!
  }

  type DashboardStats {
    totalUsers: Int!
    activeUsers: Int!
    totalTailors: Int!
    activeTailors: Int!
    totalOrders: Int!
    pendingOrders: Int!
    activeSubscriptions: Int!
    totalRevenue: Float!
  }

  input CreateAdminInput {
    fullName: String!
    email: String!
    phone: String
    password: String!
    role: String!
    permissions: [String!]
  }

  input UpdateAdminInput {
    fullName: String
    phone: String
    role: String
    permissions: [String!]
    accountStatus: String
  }
`;

export default adminTypeDefs;
