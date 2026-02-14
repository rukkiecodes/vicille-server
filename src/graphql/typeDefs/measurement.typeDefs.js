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
    neck: Float
    shoulder: Float
    chest: Float
    armLength: Float
    sleeveLength: Float
    wrist: Float
    aroundArm: Float
    topLength: Float
    waist: Float
    stomach: Float
    hips: Float
    trouserLength: Float
    inseam: Float
    thigh: Float
    knee: Float
    ankle: Float
    crotch: Float
    weight: Float
    height: Float
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
    neck: Float
    shoulder: Float
    chest: Float
    armLength: Float
    sleeveLength: Float
    wrist: Float
    aroundArm: Float
    topLength: Float
    waist: Float
    stomach: Float
    hips: Float
    trouserLength: Float
    inseam: Float
    thigh: Float
    knee: Float
    ankle: Float
    crotch: Float
    weight: Float
    height: Float
  }
`;

export default measurementTypeDefs;
