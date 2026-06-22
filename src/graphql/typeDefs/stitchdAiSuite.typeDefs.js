import gql from 'graphql-tag';

/**
 * Stitchd AI suite GraphQL surface (batch 12) — Brief Extractor + Design Generator.
 * Namespaced, tenant-scoped via `requireTailor`. Every mutation enforces the tier cap BEFORE
 * the provider call and meters usage in `stitchd_ai_usage` (reuses `stitchdAiUsage` query).
 */
const stitchdAiSuiteTypeDefs = gql`
  extend type Query {
    "Recent extracted briefs for the tailor."
    stitchdAiBriefs(limit: Int = 30): [StitchdBrief!]!
    "Recent generated designs for the tailor."
    stitchdAiDesigns(limit: Int = 30): [StitchdDesign!]!
  }

  extend type Mutation {
    "Extract a structured order brief from text or a voice note (Whisper-equivalent + GPT)."
    extractStitchdBrief(input: ExtractStitchdBriefInput!): StitchdBriefResult!

    "Generate 4–6 AI reference images (mood board) hosted on object storage."
    generateStitchdDesign(input: GenerateStitchdDesignInput!): StitchdDesignResult!

    "Attach a generated design to a customer/order (appends images to the order)."
    saveStitchdDesignTo(input: SaveStitchdDesignInput!): StitchdDesign!
  }

  type StitchdBrief {
    id: ID!
    customerId: ID
    orderId: ID
    sourceKind: String!
    transcript: String
    "Structured brief: { garmentType, fabric, colors[], deadline, instructions, measurementsMentioned, summary }"
    extracted: JSON!
    model: String
    createdAt: DateTime
  }

  type StitchdBriefResult {
    brief: StitchdBrief!
    usage: StitchdAiUsageSnapshot!
  }

  type StitchdDesign {
    id: ID!
    customerId: ID
    orderId: ID
    prompt: String!
    styleModifiers: [String!]!
    color: String
    imageUrls: [String!]!
    provider: String
    model: String
    createdAt: DateTime
  }

  type StitchdDesignResult {
    design: StitchdDesign!
    usage: StitchdAiUsageSnapshot!
  }

  input ExtractStitchdBriefInput {
    customerId: ID
    orderId: ID
    "Raw customer message (used when no voice note is supplied)."
    text: String
    "Base64 audio of a forwarded voice note (transcribed first)."
    audioBase64: String
    mimeType: String
  }

  input GenerateStitchdDesignInput {
    customerId: ID
    orderId: ID
    description: String!
    styleModifiers: [String!]
    color: String
    "4–6 images (clamped server-side)."
    count: Int
  }

  input SaveStitchdDesignInput {
    designId: ID!
    customerId: ID
    orderId: ID
  }
`;

export default stitchdAiSuiteTypeDefs;
