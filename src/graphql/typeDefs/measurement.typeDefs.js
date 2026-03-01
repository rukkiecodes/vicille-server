import gql from 'graphql-tag';

const measurementTypeDefs = gql`
  type Measurement {
    id: ID!
    user: ID!
    source: String!
    capturedBy: CapturedBy
    measurements: BodyMeasurements
    fit: String
    version: Int
    previousVersion: ID
    delta: JSON
    isActive: Boolean
    queuedForCycle: Int
    notes: String
    capturedAt: DateTime
    appliedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    userDetails: User
  }

  type CapturedBy {
    type: String
    userId: String
    name: String
  }

  type BodyMeasurements {
    # ── Shared ───────────────────────────────────────────────────────────────
    neck:          Float   # Base of throat / neck
    shoulder:      Float   # Bone-to-bone across the back
    sleeveLength:  Float   # Shoulder tip to wrist/elbow
    waist:         Float   # Belt level (male) / narrowest natural torso (female)
    hips:          Float   # Fullest part of buttocks
    thigh:         Float   # Widest part of upper leg
    knee:          Float   # Mid-leg circumference
    ankle:         Float   # Leg opening / bottom width
    trouserLength: Float   # Waistline to floor/ankle
    crotch:        Float   # Rise — front waist through legs to back waist
    weight:        Float
    height:        Float

    # ── Male-specific ─────────────────────────────────────────────────────
    chest:         Float   # Fullest part of chest (male)
    stomach:       Float   # Belly / midsection
    topLength:     Float   # Shirt/top length — shoulder-neck point to hem
    wrist:         Float   # Cuff — around the wrist

    # ── Female-specific ───────────────────────────────────────────────────
    bust:          Float   # Fullest part of chest (female — critical)
    underbust:     Float   # Directly under bra line
    highWaist:     Float   # Narrowest waist point (for skirts/trousers)
    aroundArm:     Float   # Armhole / bicep — widest part of upper arm
    gownLength:    Float   # Shoulder to desired hem (dresses)

    # ── Legacy (kept for backward compatibility) ──────────────────────────
    armLength:     Float
    inseam:        Float
  }

  type MeasurementConnection {
    nodes: [Measurement!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    measurement(id: ID!): Measurement
    measurements(
      filter: MeasurementFilterInput
      pagination: PaginationInput
    ): MeasurementConnection!
    activeMeasurement(userId: ID!): Measurement
    measurementHistory(userId: ID!, limit: Int): [Measurement!]!
  }

  extend type Mutation {
    createMeasurement(input: CreateMeasurementInput!): Measurement!
    updateMeasurement(id: ID!, input: UpdateMeasurementInput!): Measurement!
    activateMeasurement(id: ID!): Measurement!
    queueMeasurementForCycle(id: ID!, cycleNumber: Int!): Measurement!
    deleteMeasurement(id: ID!): DeleteResult!
  }

  input MeasurementFilterInput {
    user: ID
    source: String
    isActive: Boolean
    queuedForCycle: Int
  }

  input CreateMeasurementInput {
    user: ID!
    source: String!
    capturedBy: CapturedByInput
    measurements: BodyMeasurementsInput!
    fit: String
    notes: String
  }

  input UpdateMeasurementInput {
    measurements: BodyMeasurementsInput
    fit: String
    notes: String
  }

  input CapturedByInput {
    type: String!
    userId: String
    name: String
  }

  input BodyMeasurementsInput {
    # Shared
    neck: Float
    shoulder: Float
    sleeveLength: Float
    waist: Float
    hips: Float
    thigh: Float
    knee: Float
    ankle: Float
    trouserLength: Float
    crotch: Float
    weight: Float
    height: Float
    # Male-specific
    chest: Float
    stomach: Float
    topLength: Float
    wrist: Float
    # Female-specific
    bust: Float
    underbust: Float
    highWaist: Float
    aroundArm: Float
    gownLength: Float
    # Legacy
    armLength: Float
    inseam: Float
  }
`;

export default measurementTypeDefs;
