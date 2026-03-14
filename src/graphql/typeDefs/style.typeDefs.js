import gql from 'graphql-tag';

const styleTypeDefs = gql`
  type Style {
    id: ID!
    entityId: ID!
    name: String!
    slug: String!
    description: String
    category: String
    images: [JSON]
    tags: [String]
    keywords: [String]
    source: String
    searchQuery: String
    searchResults: JSON
    primaryImage: JSON
    isActive: Boolean!
    createdBy: ID
    createdAt: DateTime
    updatedAt: DateTime
  }

  type WebStyleResult {
    title: String!
    imageUrl: String!
    thumbnail: String
    sourceUrl: String
    source: String
  }

  type WebStyleSearchResponse {
    query: String!
    results: [WebStyleResult!]!
    total: Int!
  }

  type TryOnImage {
    imageUrl: String!
    publicId: String
    width: Int
    height: Int
    format: String
    bytes: Int
    model: String
  }

  type StyleTryOnResult {
    results: [TryOnImage!]!
    total: Int!
    styleTitle: String!
  }

  input UserImageInput {
    data: String!
    mimeType: String!
  }

  input StyleTryOnInput {
    styleTitle: String!
    styleDescription: String
    styleImageUrl: String
    userImages: [UserImageInput!]
    userImageUrls: [String!]
    folder: String
    tags: [String]
  }

  extend type Query {
    style(id: ID!): Style
    styleBySlug(slug: String!): Style
    styles(category: String, isActive: Boolean, limit: Int, offset: Int): [Style!]!
    searchStyles(query: String!, limit: Int): [Style!]!
    webSearchStyles(query: String!, limit: Int): WebStyleSearchResponse!
  }

  extend type Mutation {
    createStyle(input: CreateStyleInput!): Style!
    updateStyle(id: ID!, input: UpdateStyleInput!): Style
    deleteStyle(id: ID!): Boolean!
    saveSearchResultAsStyle(input: SaveStyleFromSearchInput!): Style!
    generateStyleTryOn(input: StyleTryOnInput!): StyleTryOnResult!
  }

  input CreateStyleInput {
    name: String!
    description: String
    category: String
    images: [JSON]
    tags: [String]
    keywords: [String]
    isActive: Boolean
  }

  input UpdateStyleInput {
    name: String
    description: String
    category: String
    images: [JSON]
    tags: [String]
    keywords: [String]
    isActive: Boolean
  }

  input SaveStyleFromSearchInput {
    name: String!
    description: String
    category: String
    imageUrl: String!
    thumbnail: String
    sourceUrl: String
    keywords: [String]
    tags: [String]
    searchQuery: String
  }
`;

export default styleTypeDefs;
