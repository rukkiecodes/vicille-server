# Vicelle GraphQL API Documentation

## 📋 Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication Flow](#authentication-flow)
3. [Authentication Queries & Mutations](#authentication-queries--mutations)
4. [User Queries & Mutations](#user-queries--mutations)
5. [Order Queries & Mutations](#order-queries--mutations)
6. [Subscription Queries & Mutations](#subscription-queries--mutations)
7. [Payment Queries & Mutations](#payment-queries--mutations)
8. [Tailor Queries & Mutations](#tailor-queries--mutations)
9. [Measurement Queries & Mutations](#measurement-queries--mutations)
10. [Error Handling](#error-handling)
11. [Complete Workflow Examples](#complete-workflow-examples)

---

## Getting Started

### Accessing Apollo Sandbox
Open your browser and navigate to:
```
http://localhost:5000/graphql
```

### API Endpoint
```
POST http://localhost:5000/graphql
Content-Type: application/json
```

### Database Architecture
- **Primary Database**: Firebase Firestore
- **Cache Layer**: Redis (for authenticated user sessions)
- **File Storage**: Cloudinary
- **Email Service**: NodeMailer (SMTP)

### Headers
For authenticated requests, include:
```
Authorization: Bearer <accessToken>
```

---

## Authentication Flow

### Three User Types
1. **Regular Users** - Use activation code-based authentication
2. **Tailors** - Use email/password authentication
3. **Admins** - Use email/password authentication

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  USER REGISTRATION/LOGIN:                                  │
│  ┌──────────────────────────────────────────────────┐      │
│  │ 1. Request Activation Code                       │      │
│  │    (email only)                                  │      │
│  └──────────────────────────────────────────────────┘      │
│         ↓                                                   │
│  ┌──────────────────────────────────────────────────┐      │
│  │ 2. Verify Activation Code                        │      │
│  │    (email + code)                                │      │
│  │ Returns: accessToken, refreshToken, user object │      │
│  └──────────────────────────────────────────────────┘      │
│         ↓                                                   │
│  ┌──────────────────────────────────────────────────┐      │
│  │ 3. Use accessToken in Authorization header      │      │
│  │    Store refreshToken securely                  │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  TOKEN REFRESH:                                            │
│  ┌──────────────────────────────────────────────────┐      │
│  │ When accessToken expires:                        │      │
│  │ Call refreshToken(refreshToken)                  │      │
│  │ Get new accessToken & refreshToken              │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  TAILOR/ADMIN REGISTRATION/LOGIN:                          │
│  ┌──────────────────────────────────────────────────┐      │
│  │ 1. Register: tailorRegister(input)              │      │
│  │    Login: tailorLogin(email, password)          │      │
│  │ Returns: accessToken, refreshToken, tailor obj │      │
│  └──────────────────────────────────────────────────┘      │
│         ↓                                                   │
│  ┌──────────────────────────────────────────────────┐      │
│  │ 2. Use tokens same as user authentication       │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication Queries & Mutations

### 1. User Authentication (Activation Code Based)

#### Request Activation Code
```graphql
mutation RequestActivationCode {
  requestActivationCode(
    email: "user@example.com"
    fullName: "John Doe"
    phone: "+234801234567"
  ) {
    success
    message
  }
}
```

**Response:**
```json
{
  "data": {
    "requestActivationCode": {
      "success": true,
      "message": "Activation code sent to your email"
    }
  }
}
```

#### Verify Activation Code & Login
```graphql
mutation VerifyActivationCode {
  verifyActivationCode(
    email: "user@example.com"
    code: "ABC12345"
  ) {
    accessToken
    refreshToken
    type
    user {
      id
      fullName
      email
      accountStatus
      createdAt
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "verifyActivationCode": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "type": "USER",
      "user": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "fullName": "John Doe",
        "email": "user@example.com",
        "accountStatus": "active",
        "createdAt": "2026-02-14T10:30:00Z"
      }
    }
  }
}
```

**Important:** Save both tokens:
- `accessToken`: Use in Authorization header for requests (expires in 7 days)
- `refreshToken`: Store securely to refresh when accessToken expires (expires in 30 days)

---

### 2. Tailor Authentication

#### Tailor Registration
```graphql
mutation TailorRegister {
  tailorRegister(
    input: {
      fullName: "Mary Johnson"
      email: "tailor@example.com"
      phone: "+234801234567"
      password: "SecurePassword123!"
      specialties: [
        {
          category: "DRESS_MAKING"
          proficiencyLevel: "EXPERT"
          yearsExperience: 5
        }
        {
          category: "ALTERATIONS"
          proficiencyLevel: "INTERMEDIATE"
          yearsExperience: 3
        }
      ]
    }
  ) {
    accessToken
    refreshToken
    type
    tailor {
      id
      fullName
      email
      verificationStatus
      createdAt
    }
  }
}
```

#### Tailor Login
```graphql
mutation TailorLogin {
  tailorLogin(
    email: "tailor@example.com"
    password: "SecurePassword123!"
  ) {
    accessToken
    refreshToken
    type
    tailor {
      id
      fullName
      email
      specialties {
        category
        proficiencyLevel
        yearsExperience
      }
      accountStatus
    }
  }
}
```

---

### 3. Admin Authentication

#### Admin Login
```graphql
mutation AdminLogin {
  adminLogin(
    email: "admin@vicelle.app"
    password: "AdminPassword123!"
  ) {
    accessToken
    refreshToken
    type
    admin {
      id
      fullName
      email
      role
    }
  }
}
```

---

### 4. Refresh Token

When your `accessToken` expires:

```graphql
mutation RefreshToken {
  refreshToken(
    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  ) {
    accessToken
    refreshToken
  }
}
```

**Response:**
```json
{
  "data": {
    "refreshToken": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

---

## User Queries & Mutations

### Get Current User Profile
```graphql
query GetMe {
  me {
    id
    fullName
    email
    phone
    dateOfBirth
    gender
    age
    height {
      value
      unit
      source
    }
    preferences {
      styles
      colors
      fabrics
      lifestyle
    }
    profilePhoto {
      url
      uploadedAt
    }
    deliveryDetails {
      address
      phone
      landmark
      nearestBusStop
    }
    paymentMethods {
      type
      isDefault
      provider
      last4
      expiryMonth
      expiryYear
    }
    subscriptionStatus
    accountStatus
    onboardingCompleted
    birthdayPackageEligible
    lastLoginAt
    createdAt
    updatedAt
  }
}
```

### Get Specific User (Admin/Tailor)
```graphql
query GetUser {
  user(id: "550e8400-e29b-41d4-a716-446655440000") {
    id
    fullName
    email
    accountStatus
    createdAt
  }
}
```

### List All Users (with Pagination & Filters)
```graphql
query ListUsers {
  users(
    filter: {
      accountStatus: "active"
      subscriptionStatus: "active"
    }
    pagination: {
      page: 1
      limit: 20
    }
  ) {
    nodes {
      id
      fullName
      email
      accountStatus
      subscriptionStatus
      createdAt
    }
    pageInfo {
      page
      limit
      total
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
}
```

### Update User Profile
```graphql
mutation UpdateProfile {
  updateProfile(
    input: {
      fullName: "John Doe Updated"
      phone: "+234809876543"
      dateOfBirth: "1990-05-15"
      gender: "MALE"
      height: {
        value: 6.1
        unit: "feet"
        source: "USER_INPUT"
      }
    }
  ) {
    id
    fullName
    phone
    dateOfBirth
    gender
    height {
      value
      unit
    }
  }
}
```

### Update Delivery Details
```graphql
mutation UpdateDeliveryDetails {
  updateDeliveryDetails(
    input: {
      address: "123 Main Street, Lagos, Nigeria"
      phone: "+234801234567"
      landmark: "Near Central Market"
      nearestBusStop: "Lekki Bus Station"
    }
  ) {
    id
    deliveryDetails {
      address
      phone
      landmark
      nearestBusStop
    }
  }
}
```

### Update Style Preferences
```graphql
mutation UpdatePreferences {
  updatePreferences(
    input: {
      styles: ["CASUAL", "FORMAL", "TRADITIONAL"]
      colors: ["BLUE", "BLACK", "WHITE"]
      fabrics: ["COTTON", "SILK", "LINEN"]
      lifestyle: "PROFESSIONAL"
    }
  ) {
    id
    preferences {
      styles
      colors
      fabrics
      lifestyle
    }
  }
}
```

### Complete Onboarding Step
```graphql
mutation CompleteOnboarding {
  completeOnboardingStep(
    step: 1
    data: {
      height: {
        value: 5.8
        unit: "feet"
      }
      preferences: {
        styles: ["CASUAL"]
      }
    }
  ) {
    id
    onboardingCompleted
    onboardingStep
  }
}
```

### Deactivate Account
```graphql
mutation DeactivateAccount {
  deactivateAccount {
    success
    message
  }
}
```

---

## Order Queries & Mutations

### Get Single Order
```graphql
query GetOrder {
  order(id: "order-uuid-here") {
    id
    orderNumber
    clientTag
    user
    orderType
    status
    statusHistory {
      status
      changedBy
      changedAt
      notes
    }
    productionCycle {
      cycleNumber
      month
      year
    }
    stylingWindow {
      openedAt
      closedAt
      isOpen
      lockedAt
    }
    totalAmount
    amountPaid
    outstandingBalance
    paymentStatus
    estimatedDeliveryDate
    deliveryAddress
    deliveryMethod
    items {
      id
      category
      description
      fabric
      style
      customizations
      quantity
      unitPrice
      totalPrice
      status
    }
    isStylingWindowOpen
    canBeCancelled
    createdAt
    updatedAt
  }
}
```

### Get Order by Order Number
```graphql
query GetOrderByNumber {
  orderByNumber(orderNumber: "VC-2026-0001") {
    id
    orderNumber
    status
    totalAmount
    createdAt
  }
}
```

### List My Orders
```graphql
query MyOrders {
  myOrders(
    pagination: {
      page: 1
      limit: 10
    }
  ) {
    nodes {
      id
      orderNumber
      status
      totalAmount
      estimatedDeliveryDate
      createdAt
    }
    pageInfo {
      total
      totalPages
      hasNextPage
    }
  }
}
```

### List All Orders (with Filters)
```graphql
query ListOrders {
  orders(
    filter: {
      status: "IN_PRODUCTION"
      paymentStatus: "PAID"
    }
    pagination: {
      page: 1
      limit: 20
    }
  ) {
    nodes {
      id
      orderNumber
      user
      status
      totalAmount
      createdAt
    }
    pageInfo {
      total
      totalPages
    }
  }
}
```

### Get Orders by Status
```graphql
query GetOrdersByStatus {
  ordersByStatus(status: "DELIVERED") {
    id
    orderNumber
    status
    totalAmount
    actualDeliveryDate
  }
}
```

### Create Order
```graphql
mutation CreateOrder {
  createOrder(
    input: {
      user: "user-uuid-123"
      subscription: "subscription-uuid"
      measurement: "measurement-uuid"
      orderType: "SUBSCRIPTION"
      deliveryMethod: "STANDARD"
      deliveryAddress: {
        address: "123 Main Street, Lagos"
        city: "Lagos"
        state: "Lagos"
        country: "Nigeria"
        postalCode: "101001"
        phone: "+234801234567"
        landmark: "Near Market"
      }
      productionCycle: {
        month: 2
        year: 2026
      }
      notes: "Please ensure quality seams"
      items: [
        {
          category: "DRESS"
          description: "Summer dress with floral pattern"
          fabric: {
            type: "COTTON"
            color: "BLUE"
            pattern: "FLORAL"
          }
          style: {
            neckline: "V_NECK"
            sleeves: "SHORT"
            length: "KNEE"
          }
          customizations: {
            notes: "Add belt loops"
          }
          quantity: 1
          unitPrice: 45000
        }
      ]
    }
  ) {
    id
    orderNumber
    clientTag
    user
    status
    orderType
    totalAmount
    paymentStatus
    deliveryMethod
    estimatedDeliveryDate
    deliveryAddress
    productionCycle {
      cycleNumber
      month
      year
    }
    stylingWindow {
      openedAt
      closedAt
      isOpen
    }
    createdAt
    updatedAt
  }
}
```

### Update Order Status
```graphql
mutation UpdateOrderStatus {
  updateOrderStatus(
    id: "order-uuid"
    status: "IN_PRODUCTION"
    notes: "Started production"
  ) {
    id
    status
    statusHistory {
      status
      changedAt
      notes
    }
  }
}
```

### Cancel Order
```graphql
mutation CancelOrder {
  cancelOrder(
    id: "order-uuid"
    reason: "User requested cancellation"
  ) {
    id
    status
    cancellation {
      reason
      approvedAt
      refundAmount
    }
  }
}
```

---

## Subscription Queries & Mutations

### List Subscription Plans
```graphql
query ListSubscriptionPlans {
  subscriptionPlans(
    pagination: {
      page: 1
      limit: 10
    }
  ) {
    nodes {
      id
      name
      slug
      description
      pricing {
        amount
        currency
        billingCycle
        trialDays
      }
      features {
        itemsPerCycle
        fabricOptions
        styleConsultation
        prioritySupport
        freeAlterations
        accessoryDiscount
      }
      isActive
      formattedPrice
    }
    pageInfo {
      total
    }
  }
}
```

### Get Current Subscription
```graphql
query GetMySubscription {
  mySubscription {
    id
    status
    paymentStatus
    currentCycle {
      cycleNumber
      stylingWindowOpen
      stylingWindowClose
      productionStart
      estimatedDelivery
    }
    billing {
      nextBillingDate
      lastBillingDate
      failedAttempts
    }
    planDetails {
      name
      pricing {
        amount
        currency
      }
    }
    isActive
    isStylingWindowOpen
    daysUntilNextBilling
    startDate
    createdAt
  }
}
```

### List User Subscriptions
```graphql
query ListSubscriptions {
  subscriptions(
    filter: {
      status: "ACTIVE"
    }
    pagination: {
      page: 1
      limit: 10
    }
  ) {
    nodes {
      id
      user
      planDetails {
        name
      }
      status
      startDate
    }
    pageInfo {
      total
    }
  }
}
```

### Subscribe to Plan
```graphql
mutation Subscribe {
  subscribe(planId: "plan-uuid-123") {
    id
    status
    user
    plan
    isActive
    paymentStatus
    startDate
    endDate
    planDetails {
      id
      name
      slug
      pricing {
        amount
        currency
        billingCycle
        trialDays
      }
      features {
        itemsPerCycle
        fabricOptions
        styleConsultation
        prioritySupport
      }
    }
    billing {
      nextBillingDate
      lastBillingDate
      failedAttempts
      gracePeriodEnd
    }
    currentCycle {
      cycleNumber
      stylingWindowOpen
      stylingWindowClose
      productionStart
      estimatedDelivery
    }
    isStylingWindowOpen
    daysUntilNextBilling
    createdAt
    updatedAt
  }
}
```

### Cancel Subscription
```graphql
mutation CancelSubscription {
  cancelSubscription(
    id: "subscription-uuid"
    reason: "No longer interested"
    refundRemainingBalance: true
  ) {
    id
    status
    cancellation {
      reason
      cancelledAt
      refundAmount
    }
  }
}
```

### Pause Subscription
```graphql
mutation PauseSubscription {
  pauseSubscription(
    id: "subscription-uuid"
    pauseUntil: "2026-03-15"
  ) {
    id
    status
    pausedUntil
  }
}
```

### Resume Subscription
```graphql
mutation ResumeSubscription {
  resumeSubscription(
    id: "subscription-uuid"
  ) {
    id
    status
    resumedAt
  }
}
```

---

## Payment Queries & Mutations

### Get Payment Details
```graphql
query GetPayment {
  payment(id: "payment-uuid") {
    id
    transactionReference
    user
    order
    subscription
    paymentType
    amount
    currency
    formattedAmount
    status
    paymentMethod {
      type
      provider
      last4
    }
    providerReference
    providerResponse
    metadata
    refund {
      status
      amount
      reason
      processedAt
    }
    isPaid
    canRetry
    retryCount
    paidAt
    createdAt
  }
}
```

### Get Payment by Reference
```graphql
query GetPaymentByReference {
  paymentByReference(reference: "TRX-1234567890") {
    id
    status
    amount
    paidAt
  }
}
```

### List My Payments
```graphql
query MyPayments {
  myPayments(
    pagination: {
      page: 1
      limit: 10
    }
  ) {
    nodes {
      id
      transactionReference
      amount
      formattedAmount
      status
      paidAt
    }
    pageInfo {
      total
      totalPages
    }
  }
}
```

### List All Payments (Admin)
```graphql
query ListPayments {
  payments(
    filter: {
      status: "COMPLETED"
      paymentType: "ORDER"
    }
    pagination: {
      page: 1
      limit: 20
    }
  ) {
    nodes {
      id
      user
      order
      amount
      status
      paidAt
    }
    pageInfo {
      total
    }
  }
}
```

### Initialize Payment
```graphql
mutation InitializePayment {
  initializePayment(
    input: {
      order: "order-uuid"
      paymentType: "ORDER"
      amount: 50000.00
      currency: "NGN"
      paymentMethod: {
        type: "CARD"
        provider: "PAYSTACK"
      }
    }
  ) {
    id
    transactionReference
    amount
    currency
    formattedAmount
    status
    paymentMethod {
      type
      provider
    }
    createdAt
  }
}
```

### Verify Payment
```graphql
mutation VerifyPayment {
  verifyPayment(
    reference: "TRX-1234567890"
  ) {
    id
    status
    isPaid
    paidAt
    providerResponse {
      status
      message
    }
  }
}
```

### Retry Failed Payment
```graphql
mutation RetryPayment {
  retryPayment(id: "payment-uuid") {
    id
    status
    retryCount
  }
}
```

### Refund Payment
```graphql
mutation RefundPayment {
  refundPayment(
    id: "payment-uuid"
    amount: 25000.00
    reason: "Partial refund - customer request"
  ) {
    id
    refund {
      status
      amount
      reason
      processedAt
    }
  }
}
```

---

## Tailor Queries & Mutations

### Get Tailor Profile
```graphql
query GetTailor {
  tailor(id: "tailor-uuid") {
    id
    fullName
    email
    phone
    verificationStatus
    verified At
    specialties {
      category
      proficiencyLevel
      yearsExperience
    }
    capacity {
      preferredMaxPerDay
      preferredMaxPerWeek
      currentCapacity
      isActive
    }
    performance {
      totalJobsCompleted
      onTimeDeliveryRate
      averageRating
      completionRate
    }
    availability {
      workingDays
      workingHours {
        start
        end
      }
      isAvailable
    }
    accountStatus
    isVerified
    isOnProbation
    lastActiveAt
    createdAt
  }
}
```

### List All Tailors
```graphql
query ListTailors {
  tailors(
    filter: {
      verificationStatus: "VERIFIED"
      accountStatus: "ACTIVE"
    }
    pagination: {
      page: 1
      limit: 20
    }
  ) {
    nodes {
      id
      fullName
      specialties {
        category
      }
      performance {
        onTimeDeliveryRate
        averageRating
      }
      isAvailable
    }
    pageInfo {
      total
    }
  }
}
```

### Get Available Tailors
```graphql
query GetAvailableTailors {
  availableTailors {
    id
    fullName
    specialties {
      category
    }
    capacity {
      currentCapacity
    }
    performance {
      averageRating
    }
  }
}
```

### Get Tailors by Specialty
```graphql
query GetTailorsBySpecialty {
  tailorsBySpecialty(category: "DRESS_MAKING") {
    id
    fullName
    specialties {
      proficiencyLevel
      yearsExperience
    }
    performance {
      averageRating
    }
  }
}
```

### Update Tailor Profile
```graphql
mutation UpdateTailorProfile {
  updateTailorProfile(
    input: {
      fullName: "Mary Johnson Updated"
      capacity: {
        preferredMaxPerDay: 5
        preferredMaxPerWeek: 20
        preferredMaxPerMonth: 80
      }
      availability: {
        workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
        workingHours: {
          start: "09:00"
          end: "18:00"
        }
      }
    }
  ) {
    id
    capacity {
      preferredMaxPerDay
    }
    availability {
      workingDays
    }
  }
}
```

### Update Tailor Payment Details
```graphql
mutation UpdateTailorPaymentDetails {
  updateTailorPaymentDetails(
    input: {
      bankName: "First Bank Nigeria"
      accountNumber: "1234567890"
      accountName: "Mary Johnson"
    }
  ) {
    id
    paymentDetails {
      bankName
      accountName
    }
  }
}
```

---

## Measurement Queries & Mutations

### Get Measurements
```graphql
query GetMeasurements {
  measurements(
    pagination: {
      page: 1
      limit: 10
    }
  ) {
    nodes {
      id
      user
      type
      measurements {
        chest
        waist
        hip
        shoulder
        sleeveLength
        inseam
      }
      takenAt
      validUntil
    }
    pageInfo {
      total
    }
  }
}
```

### Save Measurements
```graphql
mutation SaveMeasurements {
  saveMeasurements(
    input: {
      type: "STANDARD"
      measurements: {
        chest: 95.0
        waist: 85.0
        hip: 100.0
        shoulder: 40.0
        sleeveLength: 58.0
        inseam: 75.0
        armHole: 22.0
        neckCircumference: 38.0
      }
      notes: "Updated measurements for 2026"
    }
  ) {
    id
    type
    measurements
    takenAt
    validUntil
  }
}
```

---

## Error Handling

### Error Response Format
All errors follow GraphQL standard error format:

```json
{
  "errors": [
    {
      "message": "Unauthorized",
      "extensions": {
        "code": "UNAUTHENTICATED",
        "statusCode": 401
      }
    }
  ]
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| UNAUTHENTICATED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid input data |
| CONFLICT | 409 | Resource already exists |
| INTERNAL_SERVER_ERROR | 500 | Server error |

### Example Error Responses

#### Missing Authorization
```json
{
  "errors": [
    {
      "message": "You must be logged in to access this resource",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

#### Validation Error
```json
{
  "errors": [
    {
      "message": "Validation failed",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "details": {
          "email": "Invalid email format"
        }
      }
    }
  ]
}
```

---

## Complete Workflow Examples

### Workflow 1: User Registration to First Order

#### Step 1: Request Activation Code
```graphql
mutation {
  requestActivationCode(
    email: "john.doe@example.com"
    fullName: "John Doe"
    phone: "+234801234567"
  ) {
    success
    message
  }
}
```

#### Step 2: Verify Code and Login
```graphql
mutation {
  verifyActivationCode(
    email: "john.doe@example.com"
    code: "ABC12345"
  ) {
    accessToken
    refreshToken
    user {
      id
      fullName
    }
  }
}
```
**Save the tokens!**

#### Step 3: Complete Profile (with Authorization header)
```
Authorization: Bearer <accessToken>
```

```graphql
mutation {
  updateProfile(
    input: {
      phone: "+234809876543"
      dateOfBirth: "1990-05-15"
      gender: "MALE"
      height: {
        value: 6.0
        unit: "feet"
      }
    }
  ) {
    id
    fullName
  }
}
```

#### Step 4: Update Style Preferences
```graphql
mutation {
  updatePreferences(
    input: {
      styles: ["CASUAL", "FORMAL"]
      colors: ["BLUE", "BLACK"]
      fabrics: ["COTTON", "SILK"]
      lifestyle: "PROFESSIONAL"
    }
  ) {
    id
  }
}
```

#### Step 5: Update Delivery Details
```graphql
mutation {
  updateDeliveryDetails(
    input: {
      address: "123 Main Street, Lagos, Nigeria"
      phone: "+234801234567"
      landmark: "Near Central Market"
    }
  ) {
    id
  }
}
```

#### Step 6: View Available Subscription Plans
```graphql
query {
  subscriptionPlans {
    nodes {
      id
      name
      pricing {
        amount
        billingCycle
      }
      features {
        itemsPerCycle
      }
    }
  }
}
```

#### Step 7: Create Subscription
```graphql
mutation {
  createSubscription(
    input: {
      plan: "plan-uuid"
      billingCycle: "MONTHLY"
      paymentMethod: {
        type: "CARD"
        provider: "PAYSTACK"
      }
    }
  ) {
    id
    currentCycle {
      stylingWindowOpen
      stylingWindowClose
    }
  }
}
```

#### Step 8: Save Body Measurements
```graphql
mutation {
  saveMeasurements(
    input: {
      type: "STANDARD"
      measurements: {
        chest: 95.0
        waist: 85.0
        hip: 100.0
        shoulder: 40.0
        sleeveLength: 58.0
        inseam: 75.0
      }
    }
  ) {
    id
    validUntil
  }
}
```

#### Step 9: Create Order from Subscription
```graphql
mutation {
  createOrder(
    input: {
      subscription: "subscription-uuid"
      orderType: "SUBSCRIPTION"
      items: [
        {
          category: "DRESS"
          description: "Casual summer dress"
          fabric: {
            type: "COTTON"
            color: "BLUE"
            pattern: "SOLID"
          }
          style: {
            neckline: "ROUND"
            sleeves: "SHORT"
            length: "KNEE"
          }
          quantity: 1
        }
      ]
    }
  ) {
    id
    orderNumber
    status
    totalAmount
  }
}
```

#### Step 10: Make Payment
```graphql
mutation {
  initializePayment(
    input: {
      order: "order-uuid"
      paymentType: "ORDER"
      amount: 50000.00
      currency: "NGN"
      paymentMethod: {
        type: "CARD"
        provider: "PAYSTACK"
      }
    }
  ) {
    id
    transactionReference
  }
}
```

#### Step 11: Verify Payment (after payment gateway returns)
```graphql
mutation {
  verifyPayment(
    reference: "transaction-reference"
  ) {
    id
    status
    isPaid
  }
}
```

#### Step 12: Check Order Status
```graphql
query {
  myOrders {
    nodes {
      id
      orderNumber
      status
      estimatedDeliveryDate
    }
  }
}
```

---

### Workflow 2: Tailor Registration and Job Assignment

#### Step 1: Register as Tailor
```graphql
mutation {
  tailorRegister(
    input: {
      fullName: "Mary Johnson"
      email: "mary.tailor@example.com"
      phone: "+234802345678"
      password: "SecurePassword123!"
      specialties: [
        {
          category: "DRESS_MAKING"
          proficiencyLevel: "EXPERT"
          yearsExperience: 5
        }
      ]
    }
  ) {
    accessToken
    refreshToken
    tailor {
      id
      verificationStatus
    }
  }
}
```

#### Step 2: Update Profile
```graphql
mutation {
  updateTailorProfile(
    input: {
      capacity: {
        preferredMaxPerDay: 5
        preferredMaxPerWeek: 20
      }
      availability: {
        workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
        workingHours: {
          start: "09:00"
          end: "18:00"
        }
      }
    }
  ) {
    id
  }
}
```

#### Step 3: Add Payment Details
```graphql
mutation {
  updateTailorPaymentDetails(
    input: {
      bankName: "First Bank"
      accountNumber: "1234567890"
      accountName: "Mary Johnson"
    }
  ) {
    id
  }
}
```

#### Step 4: Admin Views Available Tailors
```graphql
query {
  availableTailors {
    id
    fullName
    specialties {
      category
    }
    capacity {
      currentCapacity
    }
  }
}
```

---

### Workflow 3: Admin Monitoring

#### Check All Active Orders
```graphql
query {
  orders(
    filter: {
      status: "IN_PRODUCTION"
    }
    pagination: {
      page: 1
      limit: 50
    }
  ) {
    nodes {
      id
      orderNumber
      user
      status
      estimatedDeliveryDate
      totalAmount
    }
    pageInfo {
      total
      totalPages
    }
  }
}
```

#### Get Payment Statistics
```graphql
query {
  payments(
    filter: {
      status: "COMPLETED"
    }
    pagination: {
      page: 1
      limit: 100
    }
  ) {
    nodes {
      id
      amount
      currency
      paidAt
    }
    pageInfo {
      total
    }
  }
}
```

#### View Active Subscriptions
```graphql
query {
  subscriptions(
    filter: {
      status: "ACTIVE"
    }
    pagination: {
      page: 1
      limit: 100
    }
  ) {
    nodes {
      id
      user
      planDetails {
        name
      }
      status
    }
    pageInfo {
      total
    }
  }
}
```

---

## Best Practices

1. **Always Store Tokens Securely**
   - Store `refreshToken` in secure storage (not localStorage for web)
   - Use `accessToken` in Authorization header
   - Never expose tokens in logs or error messages

2. **Handle Token Expiration**
   - Implement automatic token refresh before expiration
   - Catch 401 errors and refresh token
   - Redirect to login on refresh failure

3. **Use Pagination**
   - Always use pagination for list queries
   - Check `hasNextPage` for loading more data
   - Default limit is 20, adjustable up to 100

4. **Error Handling**
   - Always check for errors in response
   - Parse error extensions for detailed information
   - Implement user-friendly error messages

5. **Field Selection**
   - Only request fields you need
   - Reduces response size and improves performance
   - Uses GraphQL introspection

6. **Input Validation**
   - Validate inputs before sending
   - Parse dates and numbers correctly
   - Handle optional vs required fields

---

## Rate Limiting

- **Rate Limit**: 100 requests per minute per IP
- **Headers**: Rate limit info in response headers
- **Exceeded**: Returns 429 Too Many Requests

---

## Support

For issues or questions:
- Check Apollo Sandbox for schema documentation
- Review error messages and extensions
- Use GraphQL introspection to explore schema
- Contact support team for assistance

---

**Last Updated:** February 14, 2026  
**API Version:** 1.0  
**Base URL:** http://localhost:4000/graphql
