import gql from 'graphql-tag';

const referralTypeDefs = gql`
  type ReferralInvite {
    id: ID!
    inviterUserId: ID!
    invitedUserId: ID
    invitedEmail: String
    inviteCode: String!
    status: String!
    rewardAmount: Float!
    rewardCurrency: String!
    acceptedAt: DateTime
    rewardedAt: DateTime
    subscriptionId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ReferralSummary {
    canInvite: Boolean!
    activeSubscription: Boolean!
    totalInvites: Int!
    acceptedInvites: Int!
    rewardedInvites: Int!
    totalRewardEarned: Float!
    pendingRewardAmount: Float!
  }

  extend type Query {
    myReferralSummary: ReferralSummary!
    myReferralInvites: [ReferralInvite!]!
  }

  extend type Mutation {
    createReferralInvite(invitedEmail: String!): ReferralInvite!
    claimReferralInvite(inviteCode: String!): ReferralInvite!
  }
`;

export default referralTypeDefs;