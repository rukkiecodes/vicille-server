# Vicelle MongoDB Database Schema Design

## Overview
This document outlines the complete MongoDB database schema for the Vicelle platform, including all collections, relationships, indexes, and data validation rules.

---

## Collections Overview

1. **users** - Client/subscriber accounts
2. **tailors** - Tailor accounts and profiles
3. **admins** - Admin accounts
4. **subscriptions** - User subscription records
5. **subscriptionPlans** - Available subscription packages
6. **measurements** - User body measurements (versioned)
7. **orders** - Main order/production cycle records
8. **orderItems** - Individual garments in an order
9. **specialRequests** - One-off custom orders
10. **jobs** - Tailor job assignments
11. **materials** - Inventory materials
12. **materialIssuances** - Material distribution to jobs
13. **payments** - Payment transactions
14. **paymentAttempts** - Payment retry logs
15. **payouts** - Tailor commission payouts
16. **notifications** - All notifications
17. **ratings** - Tailor ratings by QC/admin
18. **collections** - Monthly fashion collections
19. **collectionItems** - Items within collections
20. **accessories** - Available accessories
21. **accessoryOrders** - Accessory purchase records
22. **qcReviews** - Quality control reviews
23. **auditLogs** - Immutable audit trail
24. **sessions** - Active user sessions (optional, can use Redis)

---

## Detailed Schema Definitions

### 1. Users Collection

```javascript
{
  _id: ObjectId,
  
  // Basic Information
  fullName: String,          // required, indexed
  email: String,             // required, unique, indexed, lowercase
  phone: String,             // required, unique, indexed
  
  // Authentication
  activationCode: String,    // hashed, required, select: false
  isActivated: Boolean,      // default: false, indexed
  activatedAt: Date,
  
  // Immutable Onboarding Data
  dateOfBirth: Date,         // immutable once set
  gender: String,            // enum: ['male', 'female', 'other']
  height: {
    value: Number,
    unit: String,            // enum: ['cm', 'inches'], default: 'cm'
    source: String           // enum: ['user', 'ai_scanner']
  },
  
  // Preferences
  preferences: {
    styles: [String],
    colors: [String],
    fabrics: [String],
    lifestyle: Mixed         // flexible object for lifestyle questions
  },
  
  // Profile
  profilePhoto: {
    url: String,
    publicId: String,        // Cloudinary public ID
    uploadedAt: Date
  },
  
  // Delivery Information
  deliveryDetails: {
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    phone: String,
    landmark: String,
    nearestBusStop: String
  },
  
  // Payment Information
  paymentMethods: [{
    _id: ObjectId,
    type: String,            // enum: ['card', 'standing_order']
    isDefault: Boolean,
    provider: String,        // e.g., 'paystack', 'flutterwave'
    authorizationCode: String, // Payment provider's token
    last4: String,           // Last 4 digits of card
    expiryMonth: String,
    expiryYear: String,
    bank: String,            // For standing order
    accountNumber: String,   // Encrypted, for standing order
    addedAt: Date
  }],
  
  // Subscription Status
  subscriptionStatus: String, // enum: ['active', 'inactive', 'suspended', 'cancelled'], indexed
  currentSubscription: ObjectId, // ref: 'Subscription'
  
  // Account Status
  accountStatus: String,     // enum: ['pending', 'active', 'suspended', 'deactivated'], indexed
  suspensionReason: String,
  
  // Onboarding Progress
  onboardingCompleted: Boolean, // default: false, indexed
  onboardingStep: Number,    // Track progress (0-5)
  onboardingData: Mixed,     // Temporary storage during onboarding
  
  // Birthday Package
  birthdayPackageEligible: Boolean, // Auto-calculated: ≥8 months active
  lastBirthdayPackage: Date,
  
  // Security
  lastLoginAt: Date,
  loginCount: Number,        // default: 0
  failedLoginAttempts: Number, // default: 0
  lockedUntil: Date,
  lastPasswordReset: Date,
  
  // Metadata
  createdAt: Date,           // auto
  updatedAt: Date,           // auto
  isDeleted: Boolean,        // soft delete, default: false
  deletedAt: Date
}

// Indexes
users.index({ email: 1 }, { unique: true })
users.index({ phone: 1 }, { unique: true })
users.index({ subscriptionStatus: 1, accountStatus: 1 })
users.index({ isActivated: 1 })
users.index({ onboardingCompleted: 1 })
users.index({ createdAt: -1 })
users.index({ isDeleted: 1, accountStatus: 1 })
```

---

### 2. Tailors Collection

```javascript
{
  _id: ObjectId,
  
  // Basic Information
  fullName: String,          // required
  email: String,             // required, unique
  phone: String,             // required, unique
  
  // Authentication
  password: String,          // hashed, select: false
  
  // Profile
  profilePhoto: {
    url: String,
    publicId: String
  },
  
  // Verification
  verificationStatus: String, // enum: ['pending', 'verified', 'rejected'], indexed
  verifiedBy: ObjectId,      // ref: 'Admin'
  verifiedAt: Date,
  skillTestDate: Date,
  skillTestScore: Number,
  skillTestNotes: String,
  
  // Specialties
  specialties: [{
    category: String,        // e.g., 'streetwear', 'bespoke_senators', 'native'
    proficiencyLevel: String, // enum: ['beginner', 'intermediate', 'expert']
    yearsExperience: Number
  }],
  
  // Capacity
  capacity: {
    preferredMaxPerDay: Number,
    preferredMaxPerWeek: Number,
    preferredMaxPerMonth: Number,
    currentCapacity: Number,  // System-adjusted based on performance
    isActive: Boolean         // Can be toggled off by admin
  },
  
  // Performance Metrics
  performance: {
    totalJobsCompleted: Number, // default: 0
    totalJobsAssigned: Number,
    onTimeDeliveryRate: Number, // percentage
    averageRating: Number,      // 0-5
    missedDeadlines: Number,    // default: 0
    consecutiveOnTimeJobs: Number,
    lastPerformanceReview: Date,
    isProbation: Boolean,       // First 5 jobs
    probationJobsCompleted: Number
  },
  
  // Payment Information
  paymentDetails: {
    bankName: String,
    accountNumber: String,     // Encrypted
    accountName: String,
    preferredPaymentMethod: String, // enum: ['bank_transfer', 'mobile_money']
    mobileMoneyNumber: String
  },
  
  // KYC Documents
  kycDocuments: [{
    type: String,              // enum: ['national_id', 'passport', 'drivers_license', 'utility_bill']
    url: String,
    publicId: String,
    status: String,            // enum: ['pending', 'verified', 'rejected']
    uploadedAt: Date
  }],
  
  // Work Schedule
  availability: {
    workingDays: [String],     // e.g., ['monday', 'tuesday', ...]
    workingHours: {
      start: String,           // e.g., '08:00'
      end: String              // e.g., '18:00'
    },
    isAvailable: Boolean       // Can be set unavailable temporarily
  },
  
  // Status
  accountStatus: String,       // enum: ['active', 'suspended', 'deactivated'], indexed
  suspensionReason: String,
  suspendedUntil: Date,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  lastActiveAt: Date,
  isDeleted: Boolean,
  deletedAt: Date
}

// Indexes
tailors.index({ email: 1 }, { unique: true })
tailors.index({ phone: 1 }, { unique: true })
tailors.index({ verificationStatus: 1 })
tailors.index({ accountStatus: 1 })
tailors.index({ 'specialties.category': 1 })
tailors.index({ 'performance.averageRating': -1 })
tailors.index({ 'capacity.isActive': 1, accountStatus: 1 })
```

---

### 3. Admins Collection

```javascript
{
  _id: ObjectId,
  
  fullName: String,
  email: String,             // unique
  phone: String,
  password: String,          // hashed, select: false
  
  role: String,              // enum: ['super_admin', 'admin', 'qc', 'warehouse', 'finance']
  permissions: [String],     // Array of permission strings
  
  profilePhoto: {
    url: String,
    publicId: String
  },
  
  accountStatus: String,     // enum: ['active', 'suspended', 'deactivated']
  
  createdBy: ObjectId,       // ref: 'Admin'
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date,
  isDeleted: Boolean
}

// Indexes
admins.index({ email: 1 }, { unique: true })
admins.index({ role: 1, accountStatus: 1 })
```

---

### 4. Subscription Plans Collection

```javascript
{
  _id: ObjectId,
  
  name: String,              // e.g., 'StyleU Basic', 'StyleU Premium'
  slug: String,              // unique, indexed
  description: String,
  
  pricing: {
    amount: Number,          // In smallest currency unit (kobo/cents)
    currency: String,        // default: 'NGN'
    billingCycle: String,    // enum: ['monthly', 'quarterly', 'yearly']
    installmentOption: Boolean,
    installmentCount: Number,
    installmentAmount: Number
  },
  
  features: {
    itemsPerCycle: Number,   // e.g., 4 items per month
    accessoriesIncluded: Boolean,
    priorityStyling: Boolean,
    premiumFabrics: Boolean,
    vicellePersonnelMeasurement: Boolean,
    freeShipping: Boolean,
    features: [String]       // List of feature descriptions
  },
  
  stylingWindow: {
    daysBeforeProduction: Number, // e.g., 7 days to select styles
    reminderDays: [Number]   // e.g., [7, 3, 1] - days before window closes
  },
  
  isActive: Boolean,         // Can be deactivated
  displayOrder: Number,      // For sorting on frontend
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
subscriptionPlans.index({ slug: 1 }, { unique: true })
subscriptionPlans.index({ isActive: 1, displayOrder: 1 })
```

---

### 5. Subscriptions Collection

```javascript
{
  _id: ObjectId,
  
  user: ObjectId,            // ref: 'User', required, indexed
  plan: ObjectId,            // ref: 'SubscriptionPlan', required
  
  status: String,            // enum: ['active', 'paused', 'cancelled', 'expired'], indexed
  
  billing: {
    amount: Number,
    currency: String,
    cycle: String,           // enum: ['monthly', 'quarterly', 'yearly']
    nextBillingDate: Date,   // indexed
    lastBillingDate: Date,
    isInstallment: Boolean,
    installmentsPaid: Number,
    installmentsTotal: Number,
    outstandingBalance: Number
  },
  
  currentCycle: {
    cycleNumber: Number,     // Incremental counter
    month: Number,
    year: Number,
    stylingWindowOpen: Date,
    stylingWindowClose: Date,
    productionStartDate: Date,
    estimatedDeliveryDate: Date
  },
  
  paymentStatus: String,     // enum: ['paid', 'pending', 'failed', 'overdue'], indexed
  gracePeriodEnds: Date,
  
  startDate: Date,
  endDate: Date,
  renewalEnabled: Boolean,   // Auto-renewal
  
  cancellation: {
    cancelledAt: Date,
    reason: String,
    cancelledBy: ObjectId    // ref: 'User' or 'Admin'
  },
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
subscriptions.index({ user: 1 })
subscriptions.index({ status: 1 })
subscriptions.index({ paymentStatus: 1 })
subscriptions.index({ 'billing.nextBillingDate': 1 })
subscriptions.index({ user: 1, status: 1 })
```

---

### 6. Measurements Collection

```javascript
{
  _id: ObjectId,
  
  user: ObjectId,            // ref: 'User', required, indexed
  
  source: String,            // enum: ['user', 'local_tailor', 'vicelle_personnel'], indexed
  capturedBy: {
    type: String,            // enum: ['user', 'admin', 'tailor']
    userId: ObjectId,        // ref to user/admin/tailor
    name: String
  },
  
  // Body Measurements (all in cm)
  measurements: {
    // Upper Body
    neck: Number,
    shoulder: Number,
    chest: Number,
    armLength: Number,
    sleeveLength: Number,
    wrist: Number,
    aroundArm: Number,
    
    // Torso
    topLength: Number,
    waist: Number,
    stomach: Number,
    hips: Number,
    
    // Lower Body
    trouserLength: Number,
    inseam: Number,
    thigh: Number,
    knee: Number,
    ankle: Number,
    crotch: Number,
    
    // Additional
    weight: Number,          // in kg
    height: Number           // in cm
  },
  
  // Preferences
  fit: String,               // enum: ['slim', 'regular', 'loose']
  
  // Metadata
  version: Number,           // Incremental version for this user
  previousVersion: ObjectId, // ref: 'Measurement'
  delta: Mixed,              // Changes from previous measurement
  
  isActive: Boolean,         // Only one active measurement per user
  queuedForCycle: Number,    // If updated during production
  
  notes: String,             // Warnings, special instructions
  
  capturedAt: Date,
  appliedAt: Date,           // When it was made active
  createdAt: Date,
  updatedAt: Date
}

// Indexes
measurements.index({ user: 1, isActive: 1 })
measurements.index({ user: 1, version: -1 })
measurements.index({ source: 1 })
measurements.index({ capturedAt: -1 })
```

---

### 7. Orders Collection

```javascript
{
  _id: ObjectId,
  
  orderNumber: String,       // unique, e.g., 'VIC-2024-001234', indexed
  clientTag: String,         // unique, used for material tracking, indexed
  
  user: ObjectId,            // ref: 'User', required, indexed
  subscription: ObjectId,    // ref: 'Subscription'
  measurement: ObjectId,     // ref: 'Measurement', required
  
  orderType: String,         // enum: ['subscription', 'special_request'], indexed
  
  // Production Cycle
  productionCycle: {
    cycleNumber: Number,
    month: Number,
    year: Number
  },
  
  // Styling Window
  stylingWindow: {
    openedAt: Date,
    closedAt: Date,
    isOpen: Boolean,
    lockedAt: Date           // When production started (styles locked)
  },
  
  // Order Status (follows strict state machine)
  status: String,            // enum: ['styling_in_progress', 'production_in_progress', 
                             //        'package_ready_payment_required', 'package_ready_delivery_in_progress', 
                             //        'delivered', 'cancelled'], indexed
  statusHistory: [{
    status: String,
    changedBy: ObjectId,     // ref: 'Admin'
    changedAt: Date,
    notes: String,
    notificationSent: Boolean
  }],
  
  // Estimated Dates
  estimatedProductionStart: Date,
  estimatedCompletionDate: Date,
  estimatedDeliveryDate: Date,
  actualDeliveryDate: Date,
  
  // Financial
  totalAmount: Number,
  amountPaid: Number,
  outstandingBalance: Number,
  paymentStatus: String,     // enum: ['paid', 'partial', 'pending'], indexed
  
  // Delivery
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    phone: String,
    landmark: String,
    nearestBusStop: String
  },
  deliveryMethod: String,    // enum: ['standard', 'express', 'pickup']
  trackingNumber: String,
  dispatchedAt: Date,
  deliveredAt: Date,
  deliveredBy: String,
  deliveryProof: {
    url: String,
    publicId: String
  },
  
  // Cancellation
  cancellation: {
    cancelledAt: Date,
    reason: String,
    cancelledBy: ObjectId,   // ref: 'User' or 'Admin'
    refundAmount: Number,
    refundStatus: String
  },
  
  // Metadata
  notes: String,
  internalNotes: String,     // Admin-only notes
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
orders.index({ orderNumber: 1 }, { unique: true })
orders.index({ clientTag: 1 }, { unique: true })
orders.index({ user: 1, createdAt: -1 })
orders.index({ status: 1 })
orders.index({ orderType: 1, status: 1 })
orders.index({ 'productionCycle.month': 1, 'productionCycle.year': 1 })
orders.index({ estimatedDeliveryDate: 1 })
```

---

### 8. Order Items Collection

```javascript
{
  _id: ObjectId,
  
  order: ObjectId,           // ref: 'Order', required, indexed
  
  collectionItem: ObjectId,  // ref: 'CollectionItem' (if from collection)
  
  // Item Details
  name: String,
  category: String,          // e.g., 'shirt', 'trousers', 'native_attire'
  description: String,
  
  images: [{
    url: String,
    publicId: String,
    isPrimary: Boolean
  }],
  
  // Garment Specifications
  fabric: {
    type: String,
    color: String,
    pattern: String,
    supplier: String
  },
  
  customizations: {
    buttons: String,
    lining: String,
    pockets: String,
    embroidery: String,
    specialInstructions: String
  },
  
  // Assignment
  assignedTailor: ObjectId,  // ref: 'Tailor'
  job: ObjectId,             // ref: 'Job'
  
  // Status
  itemStatus: String,        // enum: ['pending', 'assigned', 'in_progress', 'completed', 'qc_review', 'qc_approved', 'qc_rejected']
  
  // QC
  qcReview: ObjectId,        // ref: 'QCReview'
  
  // Pricing (for special requests)
  basePrice: Number,
  urgencyFee: Number,
  customizationFee: Number,
  totalPrice: Number,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
orderItems.index({ order: 1 })
orderItems.index({ assignedTailor: 1 })
orderItems.index({ itemStatus: 1 })
orderItems.index({ job: 1 })
```

---

### 9. Collections Collection

```javascript
{
  _id: ObjectId,
  
  name: String,              // e.g., 'December 2024 Collection'
  slug: String,              // unique, indexed
  description: String,
  theme: String,
  
  period: {
    month: Number,
    year: Number,
    startDate: Date,
    endDate: Date
  },
  
  coverImage: {
    url: String,
    publicId: String
  },
  
  isActive: Boolean,         // Visible to users
  isCurrent: Boolean,        // Current month's collection
  
  createdBy: ObjectId,       // ref: 'Admin'
  createdAt: Date,
  updatedAt: Date
}

// Indexes
collections.index({ slug: 1 }, { unique: true })
collections.index({ 'period.year': 1, 'period.month': 1 })
collections.index({ isActive: 1, isCurrent: 1 })
```

---

### 10. Collection Items Collection

```javascript
{
  _id: ObjectId,
  
  collection: ObjectId,      // ref: 'Collection', required, indexed
  
  name: String,
  sku: String,               // unique, indexed
  category: String,          // enum: ['shirt', 'trousers', 'jacket', 'native', 'dress', 'accessories']
  subcategory: String,
  description: String,
  
  images: [{
    url: String,
    publicId: String,
    order: Number,
    isPrimary: Boolean
  }],
  
  // Styling
  style: String,             // e.g., 'casual', 'formal', 'streetwear'
  tags: [String],            // e.g., ['summer', 'office_wear', 'party']
  colors: [String],
  availableSizes: [String],
  
  // Fabric Options
  fabricOptions: [{
    fabricType: String,
    supplier: String,
    priceModifier: Number    // Additional cost for premium fabric
  }],
  
  // Complexity (affects pricing for special requests)
  complexityLevel: String,   // enum: ['simple', 'moderate', 'complex']
  estimatedHours: Number,    // Production time estimate
  
  isActive: Boolean,
  displayOrder: Number,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
collectionItems.index({ collection: 1 })
collectionItems.index({ sku: 1 }, { unique: true })
collectionItems.index({ category: 1, subcategory: 1 })
collectionItems.index({ isActive: 1, displayOrder: 1 })
```

---

### 11. Jobs Collection (Tailor Assignments)

```javascript
{
  _id: ObjectId,
  
  jobNumber: String,         // unique, e.g., 'JOB-2024-001234'
  clientTag: String,         // Matches order.clientTag, indexed
  
  order: ObjectId,           // ref: 'Order', required, indexed
  orderItems: [ObjectId],    // refs: 'OrderItem'
  user: ObjectId,            // ref: 'User'
  
  tailor: ObjectId,          // ref: 'Tailor', indexed
  assignedBy: ObjectId,      // ref: 'Admin'
  assignmentType: String,    // enum: ['auto', 'manual', 'reassigned']
  
  // Job Details
  measurements: Mixed,       // Snapshot of measurements at assignment
  stylistInstructions: String,
  
  // Materials
  materialsRequired: [{
    material: ObjectId,      // ref: 'Material'
    quantity: Number,
    unit: String
  }],
  materialsIssued: Boolean,  // default: false
  materialsReceivedAt: Date,
  materialsReceivedBy: ObjectId, // ref: 'Tailor'
  
  // Deadlines
  dueDate: Date,             // indexed
  startedAt: Date,
  completedAt: Date,
  
  // Status
  status: String,            // enum: ['assigned', 'materials_pending', 'in_progress', 
                             //        'completed', 'under_qc', 'qc_approved', 'qc_rejected'], indexed
  statusHistory: [{
    status: String,
    changedAt: Date,
    notes: String
  }],
  
  // Proof of Completion
  completionProof: {
    groupPhoto: {
      url: String,
      publicId: String,
      uploadedAt: Date
    },
    notes: String,
    anomalies: String,
    adjustments: String
  },
  
  // QC
  qcReview: ObjectId,        // ref: 'QCReview'
  
  // Payment
  commission: Number,        // Amount tailor will be paid
  payout: ObjectId,          // ref: 'Payout'
  isPaid: Boolean,           // default: false
  
  // Reassignment History
  reassignments: [{
    fromTailor: ObjectId,
    toTailor: ObjectId,
    reason: String,
    reassignedBy: ObjectId,
    reassignedAt: Date
  }],
  
  // Flags
  isFlagged: Boolean,        // For issues
  flagReason: String,
  flaggedBy: ObjectId,
  resolvedAt: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
jobs.index({ jobNumber: 1 }, { unique: true })
jobs.index({ clientTag: 1 })
jobs.index({ order: 1 })
jobs.index({ tailor: 1, status: 1 })
jobs.index({ status: 1 })
jobs.index({ dueDate: 1 })
jobs.index({ isPaid: 1 })
```

---

### 12. Materials Collection (Inventory)

```javascript
{
  _id: ObjectId,
  
  name: String,              // e.g., 'Cotton Fabric - Navy Blue'
  sku: String,               // unique, indexed
  category: String,          // enum: ['fabric', 'buttons', 'thread', 'zippers', 'lining', 'accessories']
  
  description: String,
  supplier: String,
  
  // Stock
  quantityInStock: Number,
  unit: String,              // e.g., 'meters', 'pieces', 'yards'
  reorderLevel: Number,      // Trigger for low stock alert
  reorderQuantity: Number,
  
  // Pricing
  costPerUnit: Number,
  currency: String,
  
  // Properties (for fabric)
  properties: {
    color: String,
    pattern: String,
    weight: Number,
    composition: String,     // e.g., '100% Cotton'
    width: Number            // For fabrics
  },
  
  images: [{
    url: String,
    publicId: String
  }],
  
  isActive: Boolean,
  
  // Stock Movements (can be expanded to separate collection)
  lastRestocked: Date,
  lastIssued: Date,
  
  createdBy: ObjectId,       // ref: 'Admin'
  createdAt: Date,
  updatedAt: Date
}

// Indexes
materials.index({ sku: 1 }, { unique: true })
materials.index({ category: 1 })
materials.index({ quantityInStock: 1 })
materials.index({ isActive: 1 })
```

---

### 13. Material Issuances Collection

```javascript
{
  _id: ObjectId,
  
  job: ObjectId,             // ref: 'Job', required, indexed
  clientTag: String,         // indexed
  
  issuedTo: ObjectId,        // ref: 'Tailor', indexed
  issuedBy: ObjectId,        // ref: 'Admin'
  
  materials: [{
    material: ObjectId,      // ref: 'Material'
    quantityIssued: Number,
    unit: String
  }],
  
  status: String,            // enum: ['issued', 'received', 'partially_returned', 'fully_returned', 'lost']
  
  issuedAt: Date,
  receivedAt: Date,          // When tailor acknowledged receipt
  
  returns: [{
    material: ObjectId,
    quantityReturned: Number,
    reason: String,
    returnedAt: Date,
    receivedBy: ObjectId     // ref: 'Admin'
  }],
  
  losses: [{
    material: ObjectId,
    quantityLost: Number,
    reason: String,
    reportedAt: Date,
    penaltyAmount: Number
  }],
  
  notes: String,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
materialIssuances.index({ job: 1 })
materialIssuances.index({ clientTag: 1 })
materialIssuances.index({ issuedTo: 1 })
materialIssuances.index({ status: 1 })
```

---

### 14. Payments Collection

```javascript
{
  _id: ObjectId,
  
  transactionReference: String, // unique, indexed
  
  user: ObjectId,            // ref: 'User', indexed
  order: ObjectId,           // ref: 'Order'
  subscription: ObjectId,    // ref: 'Subscription'
  
  paymentType: String,       // enum: ['subscription', 'special_request', 'accessory', 'balance'], indexed
  
  amount: Number,
  currency: String,          // default: 'NGN'
  
  paymentMethod: {
    type: String,            // enum: ['card', 'bank_transfer', 'standing_order']
    provider: String,        // e.g., 'paystack', 'flutterwave'
    authorizationCode: String,
    last4: String
  },
  
  status: String,            // enum: ['pending', 'processing', 'success', 'failed', 'refunded'], indexed
  
  // Provider Details
  providerReference: String, // Payment gateway reference
  providerResponse: Mixed,   // Full response from provider
  
  // Metadata
  metadata: {
    channel: String,         // e.g., 'card', 'bank', 'ussd'
    cardType: String,
    bank: String,
    ipAddress: String
  },
  
  // Refund
  refund: {
    amount: Number,
    reason: String,
    refundedAt: Date,
    refundReference: String
  },
  
  // Retry Logic (for failed payments)
  retryCount: Number,        // default: 0
  nextRetryAt: Date,
  lastAttemptAt: Date,
  
  paidAt: Date,
  failedAt: Date,
  refundedAt: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
payments.index({ transactionReference: 1 }, { unique: true })
payments.index({ user: 1, createdAt: -1 })
payments.index({ order: 1 })
payments.index({ subscription: 1 })
payments.index({ status: 1 })
payments.index({ paymentType: 1, status: 1 })
payments.index({ nextRetryAt: 1 })
```

---

### 15. Payment Attempts Collection

```javascript
{
  _id: ObjectId,
  
  payment: ObjectId,         // ref: 'Payment', indexed
  user: ObjectId,            // ref: 'User'
  
  attemptNumber: Number,
  attemptType: String,       // enum: ['initial', 'retry', 'standing_order_fallback']
  
  paymentMethod: {
    type: String,
    provider: String,
    authorizationCode: String
  },
  
  amount: Number,
  
  status: String,            // enum: ['success', 'failed', 'error']
  
  // Response
  providerReference: String,
  providerResponse: Mixed,
  errorCode: String,
  errorMessage: String,
  
  attemptedAt: Date,
  
  createdAt: Date
}

// Indexes
paymentAttempts.index({ payment: 1, attemptNumber: 1 })
paymentAttempts.index({ user: 1 })
paymentAttempts.index({ status: 1 })
```

---

### 16. Payouts Collection

```javascript
{
  _id: ObjectId,
  
  payoutNumber: String,      // unique, e.g., 'PO-2024-W52-001'
  
  tailor: ObjectId,          // ref: 'Tailor', indexed
  
  period: {
    weekNumber: Number,
    startDate: Date,
    endDate: Date
  },
  
  jobs: [ObjectId],          // refs: 'Job' - QC-approved jobs in this period
  
  totalAmount: Number,
  currency: String,
  
  breakdown: [{
    job: ObjectId,
    commission: Number
  }],
  
  // Advanced Payments
  advanceAmount: Number,     // If tailor received 50% upfront
  netAmount: Number,         // Total - advance
  
  status: String,            // enum: ['pending', 'processing', 'paid', 'failed'], indexed
  
  // Payment Details
  paymentMethod: String,     // enum: ['bank_transfer', 'mobile_money']
  bankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String
  },
  
  // Processing
  processedBy: ObjectId,     // ref: 'Admin'
  processedAt: Date,
  
  // Provider
  providerReference: String,
  providerResponse: Mixed,
  
  paidAt: Date,
  failedAt: Date,
  failureReason: String,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
payouts.index({ payoutNumber: 1 }, { unique: true })
payouts.index({ tailor: 1, createdAt: -1 })
payouts.index({ status: 1 })
payouts.index({ 'period.weekNumber': 1 })
```

---

### 17. QC Reviews Collection

```javascript
{
  _id: ObjectId,
  
  job: ObjectId,             // ref: 'Job', required, indexed
  order: ObjectId,           // ref: 'Order'
  tailor: ObjectId,          // ref: 'Tailor', indexed
  
  reviewedBy: ObjectId,      // ref: 'Admin', indexed
  
  // Review Details
  decision: String,          // enum: ['approved', 'rejected', 'needs_rework'], indexed
  
  // Criteria
  criteria: {
    craftsmanship: Number,   // 1-5
    accuracy: Number,        // 1-5
    finishing: Number,       // 1-5
    timePiness: Number,      // 1-5
    overallRating: Number    // 1-5 (average)
  },
  
  // Proof Review
  groupPhotoReview: {
    isAcceptable: Boolean,
    notes: String
  },
  
  // Issues
  issues: [{
    type: String,            // enum: ['measurement', 'fabric', 'finishing', 'damage', 'missing_item']
    description: String,
    severity: String,        // enum: ['minor', 'major', 'critical']
    photo: {
      url: String,
      publicId: String
    }
  }],
  
  // Feedback
  feedback: String,
  internalNotes: String,
  
  // Rework
  reworkRequired: Boolean,
  reworkDeadline: Date,
  reworkCompleted: Boolean,
  
  reviewedAt: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
qcReviews.index({ job: 1 })
qcReviews.index({ tailor: 1, createdAt: -1 })
qcReviews.index({ reviewedBy: 1 })
qcReviews.index({ decision: 1 })
```

---

### 18. Notifications Collection

```javascript
{
  _id: ObjectId,
  
  recipient: {
    type: String,            // enum: ['user', 'tailor', 'admin']
    id: ObjectId,            // ref to User/Tailor/Admin
  },
  
  type: String,              // e.g., 'order_status_update', 'payment_successful', 'job_assigned'
  channel: [String],         // enum values: ['email', 'push', 'in_app', 'sms']
  
  title: String,
  message: String,
  
  data: Mixed,               // Additional context data
  
  // Related Entities
  order: ObjectId,
  payment: ObjectId,
  job: ObjectId,
  
  // Status
  status: String,            // enum: ['pending', 'sent', 'failed', 'read'], indexed
  
  sentAt: Date,
  readAt: Date,
  failedAt: Date,
  failureReason: String,
  
  // Email specific
  emailDetails: {
    to: String,
    subject: String,
    template: String,
    sentVia: String          // e.g., 'nodemailer'
  },
  
  // Push specific
  pushDetails: {
    deviceToken: String,
    platform: String         // enum: ['ios', 'android', 'web']
  },
  
  createdAt: Date,
  updatedAt: Date,
  
  // TTL for cleanup (optional)
  expiresAt: Date
}

// Indexes
notifications.index({ 'recipient.id': 1, createdAt: -1 })
notifications.index({ status: 1 })
notifications.index({ type: 1 })
notifications.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL index
```

---

### 19. Ratings Collection

```javascript
{
  _id: ObjectId,
  
  tailor: ObjectId,          // ref: 'Tailor', required, indexed
  job: ObjectId,             // ref: 'Job'
  qcReview: ObjectId,        // ref: 'QCReview'
  
  ratedBy: ObjectId,         // ref: 'Admin', indexed
  
  // Ratings
  craftsmanship: Number,     // 1-5
  accuracy: Number,
  timeliness: Number,
  communication: Number,
  overallRating: Number,     // Average
  
  comments: String,
  internalNotes: String,
  
  // This affects tailor's capacity and assignment priority
  impactsPerformance: Boolean, // default: true
  
  ratedAt: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
ratings.index({ tailor: 1, createdAt: -1 })
ratings.index({ ratedBy: 1 })
ratings.index({ overallRating: 1 })
```

---

### 20. Audit Logs Collection

```javascript
{
  _id: ObjectId,
  
  // Event
  eventType: String,         // e.g., 'order_created', 'payment_processed', 'job_assigned', indexed
  eventCategory: String,     // enum: ['auth', 'order', 'payment', 'job', 'admin_action'], indexed
  
  // Actor (who did it)
  actor: {
    type: String,            // enum: ['user', 'tailor', 'admin', 'system']
    id: ObjectId,
    name: String,
    email: String
  },
  
  // Target (what was affected)
  target: {
    type: String,            // e.g., 'order', 'payment', 'job'
    id: ObjectId
  },
  
  // Changes
  changes: {
    before: Mixed,           // State before action
    after: Mixed,            // State after action
    fields: [String]         // Fields that changed
  },
  
  // Context
  metadata: {
    ipAddress: String,
    userAgent: String,
    requestId: String,
    sessionId: String
  },
  
  // Additional Data
  description: String,       // Human-readable description
  severity: String,          // enum: ['info', 'warning', 'critical']
  
  timestamp: Date,           // indexed
  
  createdAt: Date            // Immutable - no updatedAt
}

// Indexes
auditLogs.index({ eventType: 1, timestamp: -1 })
auditLogs.index({ eventCategory: 1, timestamp: -1 })
auditLogs.index({ 'actor.id': 1, timestamp: -1 })
auditLogs.index({ 'target.id': 1, timestamp: -1 })
auditLogs.index({ timestamp: -1 })
auditLogs.index({ severity: 1 })
```

---

### 21. Special Requests Collection

```javascript
{
  _id: ObjectId,
  
  requestNumber: String,     // unique, indexed
  
  user: ObjectId,            // ref: 'User', required, indexed
  
  // Request Details
  eventOccasion: String,
  description: String,
  urgency: String,           // enum: ['standard', 'express', 'rush'], affects pricing
  
  // Inspiration
  inspiration: [{
    type: String,            // enum: ['image', 'link', 'collection_item']
    url: String,
    publicId: String,
    collectionItem: ObjectId // ref: 'CollectionItem'
  }],
  
  // Pricing
  pricing: {
    materialCost: Number,
    urgencyFee: Number,
    deliveryFee: Number,
    serviceFee: Number,
    totalQuote: Number,
    depositAmount: Number,   // 50% of total
    balanceAmount: Number
  },
  
  quoteApprovedBy: ObjectId, // ref: 'User'
  quoteApprovedAt: Date,
  
  // Payment
  depositPayment: ObjectId,  // ref: 'Payment'
  balancePayment: ObjectId,  // ref: 'Payment'
  
  // Production
  measurement: ObjectId,     // ref: 'Measurement'
  order: ObjectId,           // ref: 'Order' - created after deposit
  
  // Status
  status: String,            // enum: ['pending_quote', 'quote_sent', 'deposit_pending', 
                             //        'in_production', 'completed', 'cancelled'], indexed
  
  // Admin Review
  reviewedBy: ObjectId,      // ref: 'Admin'
  reviewNotes: String,
  
  // Communication
  communications: [{
    from: String,            // enum: ['user', 'admin']
    message: String,
    timestamp: Date
  }],
  
  requestedDeliveryDate: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
specialRequests.index({ requestNumber: 1 }, { unique: true })
specialRequests.index({ user: 1, createdAt: -1 })
specialRequests.index({ status: 1 })
```

---

### 22. Accessories Collection

```javascript
{
  _id: ObjectId,
  
  name: String,
  sku: String,               // unique
  category: String,          // enum: ['boxers', 'singlets', 'socks', 'ties', 'belts', 'others']
  description: String,
  
  images: [{
    url: String,
    publicId: String,
    isPrimary: Boolean
  }],
  
  // Variants
  variants: [{
    size: String,
    color: String,
    sku: String,
    quantityInStock: Number,
    price: Number
  }],
  
  basePrice: Number,
  currency: String,
  
  isActive: Boolean,
  displayOrder: Number,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
accessories.index({ sku: 1 }, { unique: true })
accessories.index({ category: 1 })
accessories.index({ isActive: 1, displayOrder: 1 })
```

---

### 23. Accessory Orders Collection

```javascript
{
  _id: ObjectId,
  
  user: ObjectId,            // ref: 'User', indexed
  order: ObjectId,           // ref: 'Order' - can only be added during 'production_in_progress'
  
  items: [{
    accessory: ObjectId,     // ref: 'Accessory'
    variantSku: String,
    quantity: Number,
    price: Number,
    subtotal: Number
  }],
  
  totalAmount: Number,
  
  payment: ObjectId,         // ref: 'Payment'
  paymentStatus: String,     // enum: ['pending', 'paid', 'failed']
  
  // Fulfillment
  status: String,            // enum: ['pending', 'processing', 'delivered']
  deliveredWith: ObjectId,   // ref: 'Order' - delivered with main package
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
accessoryOrders.index({ user: 1 })
accessoryOrders.index({ order: 1 })
accessoryOrders.index({ paymentStatus: 1 })
```

---

## Relationships Summary

### User-Centric
- User → Subscriptions (1:many)
- User → Measurements (1:many, one active)
- User → Orders (1:many)
- User → Payments (1:many)
- User → SpecialRequests (1:many)
- User → AccessoryOrders (1:many)
- User → Notifications (1:many)

### Order-Centric
- Order → OrderItems (1:many)
- Order → Jobs (1:many, via OrderItems)
- Order → Payments (1:many)
- Order → AccessoryOrders (1:many)
- Order → User (many:1)
- Order → Subscription (many:1)
- Order → Measurement (many:1, snapshot)

### Tailor-Centric
- Tailor → Jobs (1:many)
- Tailor → Ratings (1:many)
- Tailor → Payouts (1:many)
- Tailor → QCReviews (1:many)
- Tailor → MaterialIssuances (1:many)

### Job-Centric
- Job → Order (many:1)
- Job → OrderItems (1:many)
- Job → Tailor (many:1)
- Job → MaterialIssuances (1:many)
- Job → QCReview (1:1)
- Job → Payout (many:1)

---

## MongoDB-Specific Considerations

### Embedded vs Referenced Documents

**Embed When:**
- Data is always accessed together
- Data has a clear parent-child relationship
- Child data is small and bounded

Examples:
- User.paymentMethods (array of embedded docs)
- Order.statusHistory (array of embedded docs)
- Measurement.measurements (embedded object)

**Reference When:**
- Data is accessed independently
- Data is large or unbounded
- Data is shared across multiple documents

Examples:
- Order.user (ref to User)
- Job.tailor (ref to Tailor)
- Payment.order (ref to Order)

### Transactions

Critical operations requiring ACID guarantees:
1. Order creation with payment
2. Material issuance and stock update
3. Job assignment and tailor capacity update
4. Payment and subscription status update
5. Payout processing

### Indexes

**Performance Optimization:**
- Compound indexes for common query patterns
- Partial indexes for filtered queries
- Text indexes for search functionality
- TTL indexes for automatic cleanup (notifications, sessions)

### Aggregation Pipelines

Use for:
- Analytics queries
- Complex reporting
- Data transformation
- Multi-collection joins

---

## Data Validation

Each model implements:
1. **Required fields** - Enforced by Mongoose
2. **Type validation** - String, Number, Date, etc.
3. **Enum validation** - Restricted values
4. **Custom validators** - Business rules
5. **Pre/Post hooks** - Auto-calculations, cascades

---

## Migration Strategy from PostgreSQL

1. **Schema Mapping**: Map Prisma models to Mongoose schemas
2. **Relationship Translation**: Convert foreign keys to ObjectId refs
3. **Data Migration**: Export from PostgreSQL, transform, import to MongoDB
4. **Index Creation**: Recreate indexes for query optimization
5. **Testing**: Verify data integrity and query performance

---

## Next Steps

1. Implement Mongoose models based on these schemas
2. Create indexes for optimization
3. Setup validation rules
4. Implement pre/post hooks
5. Test relationships and queries
6. Create seeder scripts for development data
