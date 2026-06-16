import gql from 'graphql-tag';

/**
 * Stitchd communication GraphQL surface (batch 06).
 *
 * Message templates + logged per-customer threads (outbound only). Namespaced `stitchd*`,
 * tenant-scoped via `requireTailor`. WhatsApp deep links are client-side; the client logs the
 * message AFTER launching the link (Stitchd can't confirm WhatsApp delivery).
 */
const stitchdThreadTypeDefs = gql`
  extend type Query {
    "Resolved message templates: system defaults + this tenant's overrides (by key)."
    stitchdMessageTemplates: [StitchdMessageTemplate!]!

    "The thread + messages for one customer, newest first. Creates an empty thread lazily."
    stitchdCustomerThread(customerId: ID!): StitchdThread!
  }

  extend type Mutation {
    "Append an outbound message to a customer's thread (idempotent on clientUuid)."
    logStitchdMessage(input: LogStitchdMessageInput!): StitchdMessageResult!
  }

  enum StitchdMessageKind { TEXT VOICE PHOTO }

  type StitchdMessageTemplate {
    key: String!
    title: String!
    bodyTemplate: String!
    placeholders: [String!]!
    isCustom: Boolean!
  }

  type StitchdMessage {
    id: ID!
    clientUuid: ID!
    threadId: ID!
    customerId: ID!
    kind: String!
    body: String
    mediaUrl: String
    direction: String!
    templateKey: String
    sentVia: String!
    createdAt: DateTime
  }

  type StitchdThread {
    id: ID!
    customerId: ID!
    lastMessageAt: DateTime
    createdAt: DateTime
    updatedAt: DateTime
    messages: [StitchdMessage!]!
  }

  type StitchdMessageResult {
    thread: StitchdThread!
    message: StitchdMessage!
  }

  input LogStitchdMessageInput {
    "Client-generated UUID — idempotency key for offline-first logging (doc 01 §8)."
    clientUuid: ID!
    customerId: ID!
    body: String!
    templateKey: String
    kind: StitchdMessageKind = TEXT
    sentVia: String
  }
`;

export default stitchdThreadTypeDefs;
