import gql from 'graphql-tag';

const jobTypeDefs = gql`
  type Job {
    id: ID!
    jobNumber: String!
    clientTag: String
    order: ID
    orderItems: JSON
    user: ID
    tailor: ID
    assignedBy: String
    assignmentType: String
    measurements: JSON
    stylistInstructions: String
    materialsRequired: JSON
    materialsIssued: Boolean
    materialsReceivedAt: DateTime
    materialsReceivedBy: String
    dueDate: DateTime
    startedAt: DateTime
    completedAt: DateTime
    status: String!
    statusHistory: [StatusHistoryEntry!]
    completionProof: JSON
    proofPhotos: [String]
    proofNotes: String
    revisionNotes: String
    reassignments: JSON
    priority: String
    isOverdue: Boolean
    daysUntilDue: Int
    isComplete: Boolean
    notes: String
    internalNotes: String
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    orderDetails: Order
    tailorDetails: Tailor
    userDetails: User
    clientInfo: JobClientInfo
  }

  type JobClientInfo {
    clientName: String
    clientEmail: String
    clientPhone: String
    clientPhotoUrl: String
    measurements: JSON
    deliveryAddress: String
    landmark: String
    nearestBusStop: String
    styleImageUrl: String
    styleTitle: String
    styleDescription: String
    styleCategory: String
  }

  type JobConnection {
    nodes: [Job!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    job(id: ID!): Job
    jobs(
      filter: JobFilterInput
      pagination: PaginationInput
    ): JobConnection!
    myJobs(pagination: PaginationInput): JobConnection!
    overdueJobs: [Job!]!
  }

  extend type Mutation {
    createJob(input: CreateJobInput!): Job!
    assignJob(id: ID!, tailorId: ID!): Job!
    acceptJob(id: ID!): Job!
    declineJob(id: ID!, reason: String): Job!
    startJob(id: ID!): Job!
    completeJob(id: ID!, proof: JSON): Job!
    reassignJob(id: ID!, newTailorId: ID!, reason: String!): Job!
    updateJobStatus(id: ID!, status: String!, notes: String): Job!
    submitJobProof(id: ID!, photos: [ProofPhotoInput!]!, notes: String): Job!
  }

  input JobFilterInput {
    status: String
    tailor: ID
    user: ID
    order: ID
    priority: String
    isOverdue: Boolean
  }

  input ProofPhotoInput {
    base64: String!
    mimeType: String
  }

  input CreateJobInput {
    order: ID!
    user: ID!
    tailor: ID!
    assignmentType: String
    stylistInstructions: String
    materialsRequired: JSON
    dueDate: DateTime!
    priority: String
    notes: String
  }
`;

export default jobTypeDefs;
