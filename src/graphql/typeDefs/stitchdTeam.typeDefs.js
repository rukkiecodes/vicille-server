import gql from 'graphql-tag';

/**
 * Stitchd team & RBAC GraphQL surface (batch 16). Namespaced, tenant-scoped via `requireTailor`.
 * Team management requires the `team:manage` permission (owner holds it implicitly). Gated to
 * Pro/Enterprise with a per-tier seat cap.
 */
const stitchdTeamTypeDefs = gql`
  extend type Query {
    "Team members + pending invites for the tenant."
    stitchdTeamMembers: [StitchdTeamMember!]!
    "The caller's effective role + permission set (drives UI gating)."
    stitchdMyPermissions: StitchdMyPermissions!
    "Seat usage vs the tier cap."
    stitchdTeamSeats: StitchdTeamSeats!
    "The full permission catalog (grouped) for the role/permission editor."
    stitchdPermissionCatalog: [StitchdPermissionGroup!]!
  }

  extend type Mutation {
    "Invite a team member by phone (Pro+; enforces seat cap). Needs team:manage."
    inviteStitchdTeamMember(phone: String!, name: String, role: String!): StitchdTeamMember!
    updateStitchdTeamMemberRole(id: ID!, role: String!): StitchdTeamMember!
    setStitchdTeamMemberPermissions(id: ID!, permissions: [String!]!): StitchdTeamMember!
    setStitchdTeamMemberWorkingHours(id: ID!, workingHours: JSON!): StitchdTeamMember!
    suspendStitchdTeamMember(id: ID!, suspended: Boolean!): StitchdTeamMember!
    removeStitchdTeamMember(id: ID!): Boolean!
    resendStitchdTeamInvite(id: ID!): Boolean!
  }

  type StitchdTeamMember {
    id: ID!
    name: String
    phone: String!
    role: String!              # owner | manager | staff | viewer
    status: String!            # invited | active | suspended | removed
    permissions: [String!]!
    workingHours: JSON
    invitedAt: DateTime
    acceptedAt: DateTime
  }

  type StitchdMyPermissions {
    role: String!
    permissions: [String!]!
  }

  type StitchdTeamSeats {
    used: Int!
    cap: Int                   # null = unlimited (enterprise)
    available: Int             # null = unlimited
  }

  type StitchdPermissionGroup {
    label: String!
    permissions: [StitchdPermissionItem!]!
  }
  type StitchdPermissionItem {
    key: String!
    label: String!
  }
`;

export default stitchdTeamTypeDefs;
