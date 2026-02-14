import gql from 'graphql-tag';

const commonTypeDefs = gql`
  scalar DateTime
  scalar JSON

  type PageInfo {
    page: Int!
    limit: Int!
    total: Int!
    totalPages: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  input PaginationInput {
    page: Int = 1
    limit: Int = 20
  }

  type DeleteResult {
    success: Boolean!
    message: String!
  }

  type ProfilePhoto {
    url: String
    publicId: String
    uploadedAt: DateTime
  }

  input ProfilePhotoInput {
    url: String!
    publicId: String
  }
`;

export default commonTypeDefs;
