import gql from 'graphql-tag';

/**
 * Stitchd batch-13 surface: availability/capacity settings, capacity status, and voice-note
 * import into a customer thread. Namespaced, tenant-scoped via `requireTailor`.
 */
const stitchdRelationshipTypeDefs = gql`
  extend type Query {
    "Capacity status for the week containing weekOf (default now): declared vs committed orders."
    stitchdCapacityStatus(weekOf: String): StitchdCapacityStatus!
  }

  extend type Mutation {
    "Update working hours / weekly capacity / auto-notify; returns the updated tailor profile."
    updateStitchdAvailability(input: StitchdAvailabilityInput!): StitchdTailor!

    "Import a customer voice note: transcribe (metered) and log it to their thread."
    importStitchdVoiceNote(input: ImportStitchdVoiceNoteInput!): StitchdVoiceImportResult!
  }

  type StitchdCapacityStatus {
    weekStart: String!
    "Declared weekly capacity (orders/week); null if not set."
    capacity: Int
    "Open orders due this week."
    committed: Int!
    isOver: Boolean!
  }

  type StitchdVoiceImportResult {
    message: StitchdMessage!
    transcript: String!
    usage: StitchdAiUsageSnapshot!
  }

  input StitchdAvailabilityInput {
    weeklyCapacity: Int
    workingHours: JSON
    autoNotifyStatus: Boolean
  }

  input ImportStitchdVoiceNoteInput {
    "Client-generated UUID — idempotency key for the logged message."
    clientUuid: ID!
    customerId: ID!
    "Base64 audio of the forwarded voice note."
    audioBase64: String!
    mimeType: String
    "Optional already-uploaded media URL to keep on the message."
    mediaUrl: String
  }
`;

export default stitchdRelationshipTypeDefs;
