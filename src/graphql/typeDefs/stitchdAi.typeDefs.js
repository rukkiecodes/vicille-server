import gql from 'graphql-tag';

/**
 * Stitchd AI Fit Consultant GraphQL surface (batch 07, spec §5.6 / §7.6).
 *
 * Text-based cut/style advisor, metered + tier-capped per tenant (the `stitchdAiUsage`
 * query — feature "fit_consultant" — is declared with the measurement surface and reused
 * here). Namespaced `stitchd*`, tenant-scoped via `requireTailor`. Conversation turns are
 * persisted server-side (migration 051) so the chat survives restarts and an answer can be
 * saved as a note.
 */
const stitchdAiTypeDefs = gql`
  extend type Query {
    "Fit Consultant conversation history (oldest-first) for the authenticated tailor."
    stitchdFitConsultantHistory(limit: Int = 50): [StitchdAiMessage!]!
  }

  extend type Mutation {
    "Ask the AI Fit Consultant. Enforces the tier cap BEFORE the provider call; meters one unit on success."
    askStitchdFitConsultant(input: AskStitchdFitConsultantInput!): StitchdFitConsultantResult!

    "Append a saved AI answer to a customer's or order's notes."
    saveStitchdAiResponseAsNote(input: SaveStitchdAiResponseAsNoteInput!): StitchdSaveAiNoteResult!
  }

  type StitchdAiMessage {
    id: ID!
    clientUuid: ID
    feature: String!
    "user | assistant"
    role: String!
    content: String!
    customerId: ID
    orderId: ID
    photoUrls: [String!]!
    createdAt: DateTime
  }

  type StitchdFitConsultantResult {
    "The user's persisted prompt turn."
    question: StitchdAiMessage!
    "The assistant's persisted answer turn."
    answer: StitchdAiMessage!
    "Usage snapshot after metering this question."
    usage: StitchdAiUsageSnapshot!
  }

  type StitchdSaveAiNoteResult {
    ok: Boolean!
    customerId: ID
    orderId: ID
  }

  input AskStitchdFitConsultantInput {
    "Client-generated UUID — idempotency key for the user turn (doc 01 §8)."
    clientUuid: ID!
    prompt: String!
    "Optional customer context (links the turn; enables save-as-note)."
    customerId: ID
    "Optional order context."
    orderId: ID
    "Optional already-uploaded photo URLs as vision context (capped server-side)."
    photoUrls: [String!]
  }

  input SaveStitchdAiResponseAsNoteInput {
    "The assistant message id to save."
    messageId: ID!
    "Target customer (append to customer notes)."
    customerId: ID
    "Target order (append to order notes)."
    orderId: ID
  }
`;

export default stitchdAiTypeDefs;
