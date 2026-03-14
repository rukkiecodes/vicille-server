import gql from 'graphql-tag';

const orderTypeDefs = gql`
  type Order {
    id: ID!
    orderNumber: String!
    clientTag: String
    user: ID!
    customerName: String
    customerEmail: String
    customerPhone: String
    subscription: ID
    measurement: ID
    orderType: String!
    productionCycle: ProductionCycle
    stylingWindow: StylingWindow
    status: String!
    statusHistory: [StatusHistoryEntry!]
    estimatedProductionStart: DateTime
    estimatedCompletionDate: DateTime
    estimatedDeliveryDate: DateTime
    actualDeliveryDate: DateTime
    totalAmount: Float
    amountPaid: Float
    outstandingBalance: Float
    paymentStatus: String
    deliveryAddress: JSON
    deliveryMethod: String
    trackingNumber: String
    dispatchedAt: DateTime
    deliveredAt: DateTime
    deliveredBy: String
    deliveryProof: JSON
    cancellation: JSON
    notes: String
    internalNotes: String
    isStylingWindowOpen: Boolean
    canBeCancelled: Boolean
    canPurchaseAccessories: Boolean
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    userDetails: User
    items: [OrderItem!]
  }

  type ProductionCycle {
    cycleNumber: Int
    month: Int
    year: Int
  }

  type StylingWindow {
    openedAt: DateTime
    closedAt: DateTime
    isOpen: Boolean
    lockedAt: DateTime
  }

  type StatusHistoryEntry {
    status: String!
    changedBy: String
    changedAt: DateTime!
    notes: String
  }

  type OrderItem {
    id: ID!
    order: ID!
    category: String
    description: String
    fabric: JSON
    style: JSON
    customizations: JSON
    quantity: Int
    unitPrice: Float
    totalPrice: Float
    status: String
    notes: String
    createdAt: DateTime
    updatedAt: DateTime
  }

  type OrderConnection {
    nodes: [Order!]!
    pageInfo: PageInfo!
  }

  type StylingWindowStatus {
    isOpen: Boolean!
    opensAt: DateTime!
    closesAt: DateTime!
    source: String!
    countdownSeconds: Int!
  }

  type StylingWindowConfig {
    overrideEnabled: Boolean!
    forceIsOpen: Boolean
    overrideOpenAt: DateTime
    overrideCloseAt: DateTime
    notes: String
    updatedBy: String
    updatedAt: DateTime
  }

  type QueuedStyleSelection {
    id: ID!
    user: ID!
    measurement: ID
    orderType: String!
    category: String
    styleTitle: String!
    styleDescription: String
    styleImageUrl: String
    stylePayload: JSON
    source: String
    sourceUrl: String
    notes: String
    status: String!
    linkedOrderId: ID
    cancelReason: String
    createdAt: DateTime!
    updatedAt: DateTime!
    userDetails: User
    linkedOrder: Order
  }

  extend type Query {
    order(id: ID!): Order
    orderByNumber(orderNumber: String!): Order
    orders(
      filter: OrderFilterInput
      pagination: PaginationInput
    ): OrderConnection!
    myOrders(pagination: PaginationInput): OrderConnection!
    ordersByStatus(status: String!): [Order!]!
    stylingWindowStatus: StylingWindowStatus!
    stylingWindowConfig: StylingWindowConfig!
    myStyleQueue: [QueuedStyleSelection!]!
    styleQueue(status: String): [QueuedStyleSelection!]!
  }

  extend type Mutation {
    createOrder(input: CreateOrderInput!): Order!
    updateOrder(id: ID!, input: UpdateOrderInput!): Order!
    updateOrderStatus(id: ID!, status: String!, notes: String): Order!
    cancelOrder(id: ID!, reason: String!): Order!
    updateOrderDelivery(id: ID!, input: OrderDeliveryInput!): Order!
    addOrderItem(orderId: ID!, input: OrderItemInput!): OrderItem!
    removeOrderItem(orderId: ID!, itemId: ID!): DeleteResult!
    queueStyleSelection(input: QueueStyleSelectionInput!): QueuedStyleSelection!
    cancelQueuedStyle(id: ID!, reason: String): QueuedStyleSelection!
    escalateQueuedStyleToOrder(id: ID!): QueuedStyleSelection!
    updateStylingWindowConfig(input: UpdateStylingWindowConfigInput!): StylingWindowConfig!
  }

  input OrderFilterInput {
    status: String
    orderType: String
    user: ID
    paymentStatus: String
  }

  input CreateOrderInput {
    user: ID!
    subscription: ID
    measurement: ID
    orderType: String!
    productionCycle: ProductionCycleInput
    deliveryAddress: JSON
    deliveryMethod: String
    notes: String
    items: [OrderItemInput!]
  }

  input ProductionCycleInput {
    cycleNumber: Int
    month: Int!
    year: Int!
  }

  input OrderDeliveryInput {
    trackingNumber: String
    deliveryMethod: String
    deliveryAddress: JSON
  }

  input UpdateOrderInput {
    orderType: String
    deliveryAddress: JSON
    deliveryMethod: String
    notes: String
  }

  input OrderItemInput {
    category: String!
    description: String
    fabric: JSON
    style: JSON
    customizations: JSON
    quantity: Int
    unitPrice: Float
    notes: String
  }

  input QueueStyleSelectionInput {
    measurement: ID
    orderType: String
    category: String
    styleTitle: String!
    styleDescription: String
    styleImageUrl: String
    stylePayload: JSON
    source: String
    sourceUrl: String
    notes: String
  }

  input UpdateStylingWindowConfigInput {
    overrideEnabled: Boolean!
    forceIsOpen: Boolean
    overrideOpenAt: DateTime
    overrideCloseAt: DateTime
    notes: String
  }
`;

export default orderTypeDefs;
