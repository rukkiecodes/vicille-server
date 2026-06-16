import gql from 'graphql-tag';

/**
 * Stitchd order GraphQL surface (batch 04).
 *
 * Order lifecycle with NO QC gate / NO admin assignment (doc 01 §2). Namespaced `stitchd*`,
 * tenant-scoped via `requireTailor`. Money fields are Float (NGN). Status advances one step
 * at a time through the fixed flow; every change is logged to the activity timeline.
 */
const stitchdOrderTypeDefs = gql`
  extend type Query {
    "Order queue: tenant-scoped, filtered/sorted, with customer name + item count + urgency."
    stitchdOrders(filter: StitchdOrderFilter = ALL, sort: StitchdOrderSort = DUE): [StitchdOrder!]!

    "Orders with a due date in [start, end] (ISO dates) for the calendar."
    stitchdOrdersByDate(start: String!, end: String!): [StitchdOrder!]!

    "Full order detail incl. items, activity timeline, payment summary; null if not theirs."
    stitchdOrder(id: ID!): StitchdOrder
  }

  extend type Mutation {
    "Create an order (+items). Client UUID; defaults due +2wk and the latest measurement set."
    createStitchdOrder(input: CreateStitchdOrderInput!): StitchdOrder!

    "Advance status one step (or to an explicit target). No QC gate. Optional completion photo on Ready."
    advanceStitchdOrderStatus(id: ID!, toStatus: String, completionPhoto: StitchdOrderPhotoInput, note: String): StitchdOrder!

    "Edit due date / notes / items / total / deposit. Recomputes balance."
    updateStitchdOrder(id: ID!, input: UpdateStitchdOrderInput!): StitchdOrder!

    deleteStitchdOrder(id: ID!): Boolean!

    updateStitchdMaterialsChecklist(id: ID!, materials: [StitchdMaterialInput!]!): StitchdOrder!

    addStitchdOrderPhoto(id: ID!, photo: StitchdOrderPhotoInput!): StitchdOrder!

    addStitchdOrderVoiceNote(id: ID!, voiceNote: StitchdVoiceNoteInput!): StitchdOrder!
  }

  enum StitchdOrderFilter { ALL ACTIVE NEW IN_PROGRESS READY OVERDUE }
  enum StitchdOrderSort { DUE CREATED CUSTOMER }

  type StitchdOrder {
    id: ID!
    customerId: ID!
    customerName: String
    orderNumber: Int!
    createdOn: String
    dueDate: String
    status: String!
    linkedMeasurementSetId: ID
    totalPrice: Float!
    depositPaid: Float!
    balanceOwed: Float!
    materials: JSON!
    photos: JSON!
    voiceNotes: JSON!
    notes: String
    source: String!
    itemCount: Int!
    items: [StitchdOrderItem!]!
    activity: [StitchdOrderActivity!]!
    createdAt: DateTime
    updatedAt: DateTime
  }

  type StitchdOrderItem {
    id: ID!
    garmentType: String
    quantity: Int!
    fabricNotes: String
    unitPrice: Float!
    instructions: String
    position: Int!
  }

  type StitchdOrderActivity {
    id: ID!
    kind: String!
    fromStatus: String
    toStatus: String
    actor: String
    meta: JSON
    ts: DateTime!
  }

  input CreateStitchdOrderInput {
    id: ID
    customerId: ID!
    dueDate: String
    linkedMeasurementSetId: ID
    items: [StitchdOrderItemInput!]
    totalPrice: Float          # override; otherwise Σ(qty × unitPrice)
    depositPaid: Float
    materials: [StitchdMaterialInput!]
    photos: [StitchdOrderPhotoInput!]
    voiceNotes: [StitchdVoiceNoteInput!]
    notes: String
  }

  input UpdateStitchdOrderInput {
    dueDate: String
    notes: String
    items: [StitchdOrderItemInput!]
    totalPrice: Float
    depositPaid: Float
  }

  input StitchdOrderItemInput {
    garmentType: String
    quantity: Int
    fabricNotes: String
    unitPrice: Float
    instructions: String
  }

  input StitchdMaterialInput {
    label: String!
    done: Boolean
  }

  input StitchdOrderPhotoInput {
    id: ID!
    kind: String     # inspiration | fabric | progress | completed
    url: String!
    ts: String
  }

  input StitchdVoiceNoteInput {
    id: ID!
    url: String!
    ts: String
  }
`;

export default stitchdOrderTypeDefs;
