import gql from 'graphql-tag';

/**
 * Stitchd order/body-type templates, bulk actions & advanced AI (batch 19). Namespaced,
 * tenant-scoped. AI features are metered (doc 01 §7); social post is tier-gated.
 */
const stitchdTemplatesTypeDefs = gql`
  extend type Query {
    stitchdOrderTemplates: [StitchdOrderTemplate!]!
    stitchdBodyTypeTemplates: [StitchdBodyTypeTemplate!]!
    stitchdTagSuggestions(customerId: ID!): [StitchdTagSuggestion!]!
  }

  extend type Mutation {
    # Order templates
    createStitchdOrderTemplate(input: StitchdOrderTemplateInput!): StitchdOrderTemplate!
    updateStitchdOrderTemplate(id: ID!, input: StitchdOrderTemplateInput!): StitchdOrderTemplate!
    deleteStitchdOrderTemplate(id: ID!): Boolean!
    createStitchdOrderFromTemplate(templateId: ID!, customerId: ID!): StitchdOrder!
    # Body-type templates
    createStitchdBodyTypeTemplate(input: StitchdBodyTypeTemplateInput!): StitchdBodyTypeTemplate!
    deleteStitchdBodyTypeTemplate(id: ID!): Boolean!
    createStitchdMeasurementSetFromBodyType(templateId: ID!, customerId: ID!): StitchdMeasurementSet!
    # Bulk
    bulkAdvanceStitchdOrderStatus(orderIds: [ID!]!, toStatus: String): [StitchdBulkResult!]!
    # Advanced AI
    validateStitchdMeasurementSet(setId: ID, fields: JSON, unit: String, useAi: Boolean): [StitchdMeasurementIssue!]!
    suggestStitchdCustomerTags(customerId: ID!, useAi: Boolean): [StitchdTagSuggestion!]!
    acceptStitchdTagSuggestion(id: ID!): Boolean!
    dismissStitchdTagSuggestion(id: ID!): Boolean!
    generateStitchdSocialPost(input: StitchdSocialPostInput!): StitchdSocialPost!
  }

  input StitchdOrderTemplateItemInput {
    garmentType: String
    quantity: Int
    fabricNotes: String
    unitPrice: Float
    instructions: String
  }
  input StitchdOrderTemplateInput {
    name: String!
    items: [StitchdOrderTemplateItemInput!]!
    defaultDueOffsetDays: Int
    defaultTotal: Float
  }
  input StitchdBodyTypeTemplateInput {
    name: String!
    unit: String
    garmentType: String
    fields: JSON!
  }
  input StitchdSocialPostInput {
    topic: String
    garmentType: String
    tone: String
    platform: String
  }

  type StitchdOrderTemplate {
    id: ID!
    name: String!
    items: JSON!
    defaultDueOffsetDays: Int!
    defaultTotal: Float
    createdAt: DateTime
    updatedAt: DateTime
  }
  type StitchdBodyTypeTemplate {
    id: ID!
    name: String!
    unit: String!
    garmentType: String
    fields: JSON!
  }
  type StitchdBulkResult {
    id: ID!
    ok: Boolean!
    status: String
    error: String
  }
  type StitchdMeasurementIssue {
    field: String!
    severity: String!
    message: String!
  }
  type StitchdTagSuggestion {
    id: ID!
    customerId: ID!
    label: String!
    confidence: Float
    source: String!
    status: String!
  }
  type StitchdSocialPost {
    caption: String!
    hashtags: [String!]!
  }
`;

export default stitchdTemplatesTypeDefs;
