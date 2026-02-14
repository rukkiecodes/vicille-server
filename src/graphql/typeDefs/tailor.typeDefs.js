import gql from 'graphql-tag';

const tailorTypeDefs = gql`
  type Tailor {
    id: ID!
    fullName: String!
    email: String!
    phone: String
    profilePhoto: ProfilePhoto
    verificationStatus: String!
    verifiedAt: DateTime
    specialties: [Specialty!]
    capacity: TailorCapacity
    performance: TailorPerformance
    paymentDetails: TailorPaymentDetails
    availability: TailorAvailability
    accountStatus: String!
    completionRate: Int
    isVerified: Boolean
    isOnProbation: Boolean
    lastActiveAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Specialty {
    category: String!
    proficiencyLevel: String
    yearsExperience: Int
  }

  type TailorCapacity {
    preferredMaxPerDay: Int
    preferredMaxPerWeek: Int
    preferredMaxPerMonth: Int
    currentCapacity: Int
    isActive: Boolean
  }

  type TailorPerformance {
    totalJobsCompleted: Int
    totalJobsAssigned: Int
    onTimeDeliveryRate: Float
    averageRating: Float
    missedDeadlines: Int
    consecutiveOnTimeJobs: Int
    isProbation: Boolean
    probationJobsCompleted: Int
  }

  type TailorPaymentDetails {
    bankName: String
    accountNumber: String
    accountName: String
  }

  type TailorAvailability {
    workingDays: [String!]
    workingHours: WorkingHours
    isAvailable: Boolean
  }

  type WorkingHours {
    start: String
    end: String
  }

  type TailorConnection {
    nodes: [Tailor!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    tailor(id: ID!): Tailor
    tailors(
      filter: TailorFilterInput
      pagination: PaginationInput
    ): TailorConnection!
    availableTailors: [Tailor!]!
    tailorsBySpecialty(category: String!): [Tailor!]!
  }

  extend type Mutation {
    updateTailorProfile(input: UpdateTailorProfileInput!): Tailor!
    updateTailorCapacity(input: TailorCapacityInput!): Tailor!
    updateTailorAvailability(input: TailorAvailabilityInput!): Tailor!
    updateTailorPaymentDetails(input: TailorPaymentDetailsInput!): Tailor!
    verifyTailor(id: ID!, score: Float, notes: String): Tailor!
    rejectTailor(id: ID!, reason: String!): Tailor!
    suspendTailor(id: ID!, reason: String!, until: DateTime): Tailor!
    reactivateTailor(id: ID!): Tailor!
  }

  input TailorFilterInput {
    accountStatus: String
    verificationStatus: String
  }

  input UpdateTailorProfileInput {
    fullName: String
    phone: String
    profilePhoto: ProfilePhotoInput
    specialties: [SpecialtyInput!]
  }

  input TailorCapacityInput {
    preferredMaxPerDay: Int
    preferredMaxPerWeek: Int
    preferredMaxPerMonth: Int
    currentCapacity: Int
    isActive: Boolean
  }

  input TailorAvailabilityInput {
    workingDays: [String!]
    workingHoursStart: String
    workingHoursEnd: String
    isAvailable: Boolean
  }

  input TailorPaymentDetailsInput {
    bankName: String!
    accountNumber: String!
    accountName: String!
  }
`;

export default tailorTypeDefs;
