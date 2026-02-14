# Vicelle GraphQL - Quick Reference Guide

## 🚀 API Endpoint
```
http://localhost:5000/graphql
```

## 🏗️ Architecture
- **Primary Database**: Firebase Firestore
- **Cache Layer**: Redis (authenticated sessions)
- **File Storage**: Cloudinary
- **Email**: NodeMailer (SMTP)

---

## 📱 COMPLETE USER WORKFLOW

### Step 1️⃣: Request Activation Code
**User provides email only (no password needed)**

```graphql
mutation {
  requestActivationCode(
    email: "john@example.com"
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
**⚠️ Note:** In development, the code is logged in server console. In production, it's sent via email.

---

### Step 2️⃣: Verify Activation Code & Get Tokens
**User verifies code received in email**

```graphql
mutation {
  verifyActivationCode(
    email: "john@example.com"
    code: "ABC12345"
  ) {
    accessToken
    refreshToken
    user {
      id
      email
      fullName
      phone
      accountStatus
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
      "user": {
        "id": "user-uuid-123",
        "email": "john@example.com",
        "fullName": "John Doe",
        "phone": "+234801234567",
        "accountStatus": "active"
      }
    }
  }
}
```

✅ **Store these tokens:**
- `accessToken` → Use in Authorization header for all requests
- `refreshToken` → Store securely to refresh access token when expired

---

### Step 3️⃣: Use Access Token for Authenticated Requests
**All future requests include in headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Step 4️⃣: Complete Onboarding (Immutable Data)
**Set personal preferences that can't be changed later**

```graphql
mutation {
  completeOnboardingStep(
    step: 1
    data: {
      dateOfBirth: "1995-05-15"
      gender: "MALE"
      height: {
        value: 5.9
        unit: "feet"
      }
      preferences: {
        styles: ["CASUAL", "FORMAL", "TRADITIONAL"]
        colors: ["BLUE", "BLACK"]
        fabrics: ["COTTON", "SILK"]
        lifestyle: "PROFESSIONAL"
      }
    }
  ) {
    id
    onboardingCompleted
    onboardingStep
  }
}
```

**Response:**
```json
{
  "data": {
    "completeOnboardingStep": {
      "id": "user-uuid-123",
      "onboardingCompleted": true,
      "onboardingStep": 1
    }
  }
}
```

---

### Step 5️⃣: Update Profile (Can be changed anytime)
**Update profile photo, profile data**

```graphql
mutation {
  updateUserProfile(
    input: {
      fullName: "John Doe"
      phone: "+234801234567"
      profilePhoto: {
        url: "https://cloudinary.com/..."
        publicId: "vicelle/users/photo123"
      }
    }
  ) {
    id
    fullName
    phone
    profilePhoto {
      url
      publicId
    }
  }
}
```

---

### Step 6️⃣: Get User Profile
**Fetch current user info**

```graphql
query {
  me {
    id
    email
    fullName
    phone
    dateOfBirth
    gender
    height {
      value
      unit
    }
    preferences {
      styles
      colors
      fabrics
      lifestyle
    }
    profilePhoto {
      url
      publicId
    }
    accountStatus
    onboardingCompleted
    subscriptionStatus
    currentSubscription
  }
}
```

---

### Step 7️⃣: Update Delivery Details
**Set default delivery address**

```graphql
mutation {
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

---

## 🛍️ ORDER WORKFLOW

### Step 1️⃣: View Available Subscriptions
**See all subscription plans**

```graphql
query {
  subscriptionPlans {
    id
    name
    description
    price
    billingCycle
    items
    features
  }
}
```

---

### Step 2️⃣: Create Subscription Order
**Subscribe to a plan**

```graphql
mutation Subscribe {
  subscribe(planId: "plan-uuid-123") {
    id
    status
    startDate
    isActive
    planDetails {
      name
      pricing {
        amount
        currency
        billingCycle
      }
    }
    billing {
      nextBillingDate
      lastBillingDate
    }
  }
}
```

---

### Step 3️⃣: Create Measurement
**Record body measurements**

```graphql
mutation {
  createMeasurement(
    input: {
      measurements: {
        bust: 38
        waist: 32
        hip: 40
        shoulder: 18
        sleeve: 33
        inseam: 32
        neckSize: 15.5
      }
      notes: "Standard fit preferred"
    }
  ) {
    id
    measurements {
      bust
      waist
      hip
    }
    createdAt
  }
}
```

---

### Step 4️⃣: Create Order
**Place an order for styling**

```graphql
mutation {
  createOrder(
    input: {
      subscriptionId: "subscription-uuid"
      measurementId: "measurement-uuid"
      orderType: "SUBSCRIPTION"
      deliveryMethod: "STANDARD"
    }
  ) {
    id
    orderNumber
    clientTag
    status
    estimatedDeliveryDate
    totalAmount
  }
}
```

---

### Step 5️⃣: View Orders
**Get all user orders**

```graphql
query {
  orders(
    filter: {
      status: "STYLING_IN_PROGRESS"
    }
    pagination: {
      page: 1
      limit: 10
    }
  ) {
    nodes {
      id
      orderNumber
      status
      estimatedDeliveryDate
      totalAmount
      isStylingWindowOpen
      canBeCancelled
    }
    pageInfo {
      total
      totalPages
      hasNextPage
    }
  }
}
```

---

### Step 6️⃣: Get Order Details
**View detailed order info**

```graphql
query {
  order(id: "order-uuid") {
    id
    orderNumber
    clientTag
    status
    statusHistory {
      status
      changedAt
      notes
    }
    measurement {
      id
      measurements {
        bust
        waist
      }
    }
    productionCycle {
      cycleNumber
      month
      year
    }
    stylingWindow {
      isOpen
      openedAt
      closedAt
    }
    estimatedDeliveryDate
    deliveryAddress {
      address
      phone
      landmark
    }
    totalAmount
    amountPaid
    paymentStatus
  }
}
```

---

### Step 7️⃣: Cancel Order (If Styling Window Open)
**Cancel order during styling phase**

```graphql
mutation {
  cancelOrder(
    orderId: "order-uuid"
    reason: "Changed my mind"
  ) {
    success
    message
    refundAmount
  }
}
```

---

## 💳 PAYMENT WORKFLOW

### Step 1️⃣: Initialize Payment
**Start payment process**

```graphql
mutation {
  initializePayment(
    input: {
      orderId: "order-uuid"
      amount: 25000
      paymentMethod: "CARD"
      currency: "NGN"
    }
  ) {
    id
    reference
    authorizationUrl
    accessCode
    status
  }
}
```

---

### Step 2️⃣: Verify Payment
**Check if payment was successful**

```graphql
mutation {
  verifyPayment(
    paymentId: "payment-uuid"
  ) {
    id
    status
    amount
    paidAt
    order {
      id
      orderNumber
      paymentStatus
    }
  }
}
```

---

### Step 3️⃣: Get Payment History
**View all payments**

```graphql
query {
  payments(
    filter: {
      status: "COMPLETED"
    }
    pagination: {
      page: 1
      limit: 20
    }
  ) {
    nodes {
      id
      amount
      currency
      status
      paidAt
      order {
        orderNumber
      }
    }
    pageInfo {
      total
      totalPages
    }
  }
}
```

---

## 👨‍🔧 TAILOR WORKFLOW

### Step 1️⃣: Register as Tailor
**Create tailor account**

```graphql
mutation {
  tailorRegister(
    input: {
      email: "tailor@example.com"
      password: "securepwd123"
      fullName: "Aman Tailor"
      phone: "+234801234567"
      businessName: "Aman's Tailoring"
    }
  ) {
    accessToken
    refreshToken
    tailor {
      id
      email
      fullName
      businessName
    }
  }
}
```

---

### Step 2️⃣: Tailor Login
**Login with email & password**

```graphql
mutation {
  tailorLogin(
    email: "tailor@example.com"
    password: "securepwd123"
  ) {
    accessToken
    refreshToken
    tailor {
      id
      email
      fullName
      accountStatus
    }
  }
}
```

---

### Step 3️⃣: Get Assigned Orders
**View orders assigned to tailor**

```graphql
query {
  myOrders(
    filter: {
      status: "STYLING_IN_PROGRESS"
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
      measurement {
        measurements {
          bust
          waist
        }
      }
      stylingWindow {
        isOpen
        openedAt
        closedAt
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

### Step 4️⃣: Update Order Status
**Change order status (tailor only)**

```graphql
mutation {
  updateOrderStatus(
    orderId: "order-uuid"
    newStatus: "PRODUCTION_IN_PROGRESS"
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

---

### Step 5️⃣: Complete Production
**Mark production complete**

```graphql
mutation {
  completeProduction(
    orderId: "order-uuid"
  ) {
    id
    status
    estimatedDeliveryDate
  }
}
```

---

## 🔐 TOKEN MANAGEMENT

### Refresh Access Token (When it expires)
**Get new access token using refresh token**

```graphql
mutation {
  refreshToken(
    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  ) {
    accessToken
    refreshToken
  }
}
```

---

### Logout
**Invalidate tokens**

```graphql
mutation {
  logout {
    success
    message
  }
}
```

---

## ❌ ERROR HANDLING

### Typical Error Response
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
- `UNAUTHENTICATED` (401) - No/invalid token
- `FORBIDDEN` (403) - Missing permissions
- `NOT_FOUND` (404) - Resource doesn't exist
- `BAD_USER_INPUT` (400) - Invalid input
- `INTERNAL_SERVER_ERROR` (500) - Server error

---

## 📌 KEY POINTS

1. **Activation Code** - Usually alphanumeric, check server logs in dev
2. **Tokens Expire** - Access token valid for 7 days, refresh for 30 days
3. **Immutable Data** - DOB, gender, height, preferences cannot be changed
4. **Styling Window** - Period when tailor can work on outfit selection
5. **Order Status** - STYLING → PRODUCTION → DELIVERY → COMPLETED
6. **Authorization** - All authenticated queries need `Authorization` header

---

## 🧪 TEST IN APOLLO SANDBOX

1. Open `http://localhost:4000/graphql`
2. Copy any query above
3. Paste into Apollo Sandbox
4. Set Authorization header: `Authorization: Bearer <token>`
5. Click "Play" to execute

---

**Last Updated:** February 14, 2026
