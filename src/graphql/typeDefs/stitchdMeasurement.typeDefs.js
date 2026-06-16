import gql from 'graphql-tag';

/**
 * Stitchd measurement GraphQL surface (batch 03).
 *
 * Versioned, append-only measurement sets (spec §5.2, §7.3) + voice-to-measurement
 * transcription gated by per-tenant AI metering (doc 01 §7). Namespaced `stitchd*` and
 * tenant-scoped via `requireTailor`. `fields` uses the JSON scalar so it can carry the
 * flexible `BodyMeasurements` vocabulary (neck, shoulder, chest, bust, waist, …).
 */
const stitchdMeasurementTypeDefs = gql`
  extend type Query {
    "Measurement history for a customer, newest-first, with diff vs the previous version."
    stitchdMeasurementSets(customerId: ID!): [StitchdMeasurementSet!]!

    "A single measurement set owned by the authenticated tailor; null if not theirs."
    stitchdMeasurementSet(id: ID!): StitchdMeasurementSet

    "Current AI usage for the authenticated tailor (e.g. transcription allowance)."
    stitchdAiUsage(feature: String = "transcription"): StitchdAiUsageSnapshot!
  }

  extend type Mutation {
    "Append a new versioned measurement set (never overwrites). Accepts a client UUID."
    appendStitchdMeasurementSet(input: AppendStitchdMeasurementSetInput!): StitchdMeasurementSet!

    "Transcribe a dictation clip to measurement candidates. Meters one AI unit; enforces the tier cap first."
    transcribeStitchdMeasurements(input: TranscribeStitchdMeasurementsInput!): StitchdTranscriptionResult!
  }

  type StitchdMeasurementSet {
    id: ID!
    customerId: ID!
    takenOn: String          # ISO calendar date YYYY-MM-DD
    takenBy: String
    unit: String!            # cm | inch
    garmentType: String
    fields: JSON!            # BodyMeasurements-keyed values, e.g. { "neck": 14, "chest": 38 }
    photos: [String!]
    voiceNote: String
    notes: String
    version: Int!
    previousVersionId: ID
    createdAt: DateTime
    "Per-field diff vs the immediately-older version (shared numeric keys only)."
    changes: [StitchdMeasurementChange!]!
  }

  type StitchdMeasurementChange {
    field: String!
    from: Float
    to: Float
    delta: Float
  }

  type StitchdTranscriptionResult {
    transcript: String!
    fields: JSON!            # parsed { field: value } candidates (editable client-side)
    matchedCount: Int!
    usage: StitchdAiUsageSnapshot!
  }

  type StitchdAiUsageSnapshot {
    feature: String!
    period: String!          # YYYY-MM
    used: Int!
    cap: Int                 # null = unlimited
    remaining: Int           # null = unlimited
  }

  input AppendStitchdMeasurementSetInput {
    "Optional client-generated UUID for offline-first idempotent capture (doc 01 §8)."
    id: ID
    customerId: ID!
    takenOn: String
    takenBy: String
    unit: String             # cm | inch (defaults to inch)
    garmentType: String
    fields: JSON!
    photos: [String!]
    voiceNote: String
    notes: String
  }

  input TranscribeStitchdMeasurementsInput {
    "Base64-encoded audio clip (short dictation)."
    audioBase64: String!
    mimeType: String         # e.g. audio/m4a
    unit: String             # cm | inch (context only; values are not converted)
  }
`;

export default stitchdMeasurementTypeDefs;
