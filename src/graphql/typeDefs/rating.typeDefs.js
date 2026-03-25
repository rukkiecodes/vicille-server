import gql from 'graphql-tag';

const ratingTypeDefs = gql`
  type Rating {
    id: ID!
    job: ID!
    tailor: ID!
    ratedBy: ID!
    stars: Float!
    comment: String
    createdAt: DateTime!
  }

  type TailorRatingSummary {
    tailor: Tailor!
    avgStars: Float!
    totalJobs: Int!
  }

  extend type Query {
    # Returns tailors who completed jobs for the authenticated user, ranked by avg rating
    myCompletedTailors: [TailorRatingSummary!]!
    # Rating for a specific job (so user app knows if already rated)
    ratingForJob(jobId: ID!): Rating
  }

  extend type Mutation {
    # User rates a tailor after job completion (1-5 stars)
    submitUserRating(jobId: ID!, tailorId: ID!, stars: Int!, comment: String): Rating!
  }
`;

export default ratingTypeDefs;
