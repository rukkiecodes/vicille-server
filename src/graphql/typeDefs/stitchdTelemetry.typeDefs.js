import gql from 'graphql-tag';

/**
 * Stitchd telemetry surface (batch 08) — analytics events + beta feedback, self-hosted in
 * Supabase (no third-party vendor). Clients send only event names + non-PII props; the
 * server scrubs known PII keys as a backstop. Namespaced, tenant-scoped via `requireTailor`.
 */
const stitchdTelemetryTypeDefs = gql`
  extend type Mutation {
    "Record a batch of analytics events (activation funnel + engagement). Returns the count stored."
    logStitchdEvents(events: [StitchdEventInput!]!): Int!

    "Submit in-app beta feedback (message + optional screenshot + screen context)."
    submitStitchdFeedback(input: StitchdFeedbackInput!): StitchdFeedbackResult!
  }

  input StitchdEventInput {
    "Event name, e.g. 'first_customer_created', 'ai_used', 'whatsapp_message_sent'."
    event: String!
    "Non-PII context only (counts, ids of own records, screen). PII keys are dropped server-side."
    props: JSON
    "Device timestamp the event happened (ISO)."
    clientTs: String
  }

  input StitchdFeedbackInput {
    message: String!
    screenshotUrl: String
    "{ screen, appVersion, platform } — no PII."
    context: JSON
  }

  type StitchdFeedbackResult {
    id: ID!
    createdAt: DateTime
  }
`;

export default stitchdTelemetryTypeDefs;
