# Vicelle GraphQL API - Testing & Examples Guide

## 🧪 Testing in Apollo Sandbox

1. Open: `http://localhost:5000/graphql`
2. Paste queries from sections below
3. Set headers for authenticated requests
4. Click "Play" button to execute

---

## 📋 SCENARIO 1: New User Registration & Setup

### 1️⃣ Request Activation Code

```graphql
mutation RequestCode {
  requestActivationCode(
    email: "newuser@example.com"
    fullName: "Sarah Johnson"
    phone: "+234801234567"
  ) {
    success
    message
  }
}
```

**Expected Response:**
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

📌 **In development:** Check server console for the activation code

---

### 2️⃣ Verify Code & Get Tokens

```graphql
mutation VerifyCode {
  verifyActivationCode(
    email: "newuser@example.com"
    code: "ABC123XY"
  ) {
    accessToken
    refreshToken
    user {
      id
      email
      fullName
      phone
    }
  }
}
```

**Expected Response:**
```json
{
  "data": {
    "verifyActivationCode": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "newuser@example.com",
        "fullName": "Sarah Johnson",
        "phone": "+234801234567"
      }
    }
  }
}
```

✅ **Copy the `accessToken` - you'll need it for next steps**

---

### 3️⃣ Set Authorization Header

In Apollo Sandbox, click the "Headers" tab and add:

```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Replace with actual `accessToken` from step 2.

---

### 4️⃣ Get User Profile

```graphql
query GetProfile {
  me {
    id
    email
    fullName
    phone
    accountStatus
    onboardingCompleted
    subscriptionStatus
  }
}
```

**Expected Response:**
```json
{
  "data": {
    "me": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "newuser@example.com",
      "fullName": "Sarah Johnson",
      "phone": "+234801234567",
      "accountStatus": "active",
      "onboardingCompleted": false,
      "subscriptionStatus": "inactive"
    }
  }
}
```

✅ **User account created successfully!**

---

### 5️⃣ Complete Onboarding (Set Immutable Data)

This data CANNOT be changed later - be careful!

```graphql
mutation CompleteOnboarding {
  completeOnboardingStep(
    step: 1
    data: {
      dateOfBirth: "1995-08-20"
      gender: "FEMALE"
      height: {
        value: 5.6
        unit: "feet"
      }
      preferences: {
        styles: ["CASUAL", "FORMAL", "TRADITIONAL"]
        colors: ["BLUE", "BLACK", "GOLD", "RED"]
        fabrics: ["COTTON", "SILK", "LINEN", "ANKARA"]
        lifestyle: "PROFESSIONAL"
      }
    }
  ) {
    id
    onboardingCompleted
    onboardingStep
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
    }
  }
}
```

**Expected Response:**
```json
{
  "data": {
    "completeOnboardingStep": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "onboardingCompleted": true,
      "onboardingStep": 1,
      "dateOfBirth": "1995-08-20",
      "gender": "FEMALE",
      "height": {
        "value": 5.6,
        "unit": "feet"
      },
      "preferences": {
        "styles": ["CASUAL", "FORMAL", "TRADITIONAL"],
        "colors": ["BLUE", "BLACK", "GOLD", "RED"],
        "fabrics": ["COTTON", "SILK", "LINEN", "ANKARA"]
      }
    }
  }
}
```

✅ **Onboarding complete!**

---

## 📦 SCENARIO 2: Complete Order Workflow

### 1️⃣ View Subscription Plans

```graphql
query GetPlans {
  subscriptionPlans {
    id
    name
    description
    price
    billingCycle
    features
  }
}
```

**Expected Response:**
```json
{
  "data": {
    "subscriptionPlans": [
      {
        "id": "plan-001",
        "name": "STARTER",
        "description": "2 outfits per month",
        "price": 25000,
        "billingCycle": "MONTHLY",
        "features": ["2 outfits", "Styling consultation"]
      },
      {
        "id": "plan-002",
        "name": "PREMIUM",
        "description": "4 outfits per month",
        "price": 45000,
        "billingCycle": "MONTHLY",
        "features": ["4 outfits", "Priority support", "Free alterations"]
      }
    ]
  }
}
```

---

### 2️⃣ Create Subscription

```graphql
mutation Subscribe {
  createSubscription(
    input: {
      planId: "plan-002"
      paymentMethod: "CARD"
    }
  ) {
    id
    planDetails {
      id
      name
      price
    }
    status
    startDate
    nextBillingDate
  }
}
```

**Expected Response:**
```json
{
  "data": {
    "createSubscription": {
      "id": "sub-001",
      "planDetails": {
        "id": "plan-002",
        "name": "PREMIUM",
        "price": 45000
      },
      "status": "ACTIVE",
      "startDate": "2024-02-14T00:00:00Z",
      "nextBillingDate": "2024-03-14T00:00:00Z"
    }
  }
}
```

---

### 3️⃣ Set Delivery Details

```graphql
mutation SetDelivery {
  updateDeliveryDetails(
    input: {
      address: "45 Victoria Island, Lagos"
      phone: "+234801234567"
      landmark: "Next to Lekki Phase 1 Gate"
      nearestBusStop: "VI Bus Stop"
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

### 4️⃣ Create Measurements

```graphql
mutation CreateMeasurements {
  createMeasurement(
    input: {
      measurements: {
        bust: 36
        waist: 28
        hip: 38
        shoulder: 16
        sleeve: 24
        inseam: 30
        neckSize: 14
        length: 58
      }
      notes: "Prefer slightly loose fit, no sleeveless"
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

**Expected Response:**
```json
{
  "data": {
    "createMeasurement": {
      "id": "meas-001",
      "measurements": {
        "bust": 36,
        "waist": 28,
        "hip": 38
      },
      "createdAt": "2024-02-14T10:30:00Z"
    }
  }
}
```

---

### 5️⃣ Create Order

```graphql
mutation CreateOrder {
  createOrder(
    input: {
      subscriptionId: "sub-001"
      measurementId: "meas-001"
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
    stylingWindow {
      openedAt
      closedAt
      isOpen
    }
  }
}
```

**Expected Response:**
```json
{
  "data": {
    "createOrder": {
      "id": "order-001",
      "orderNumber": "ORD-2024-0001",
      "clientTag": "SJ-001",
      "status": "STYLING_IN_PROGRESS",
      "estimatedDeliveryDate": "2024-02-28T00:00:00Z",
      "totalAmount": 45000,
      "stylingWindow": {
        "openedAt": "2024-02-14T10:35:00Z",
        "closedAt": "2024-02-21T23:59:59Z",
        "isOpen": true
      }
    }
  }
}
```

---

### 6️⃣ Check Order Details

```graphql
query GetOrder {
  order(id: "order-001") {
    id
    orderNumber
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
        hip
      }
    }
    stylingWindow {
      isOpen
      openedAt
      closedAt
    }
    estimatedDeliveryDate
    totalAmount
    paymentStatus
  }
}
```

---

## 💳 SCENARIO 3: Payment Processing

### 1️⃣ Initialize Payment

```graphql
mutation InitiatePay {
  initializePayment(
    input: {
      orderId: "order-001"
      amount: 45000
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

**Expected Response:**
```json
{
  "data": {
    "initializePayment": {
      "id": "pay-001",
      "reference": "RVN-001-20240214",
      "authorizationUrl": "https://checkout.paystack.com/...",
      "accessCode": "access_code_xxxxxxxxxxxx",
      "status": "PENDING"
    }
  }
}
```

📌 **In production:** Open the `authorizationUrl` in browser to complete payment

---

### 2️⃣ Verify Payment (After user completes payment)

```graphql
mutation VerifyPay {
  verifyPayment(
    paymentId: "pay-001"
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

**Expected Response (after successful payment):**
```json
{
  "data": {
    "verifyPayment": {
      "id": "pay-001",
      "status": "COMPLETED",
      "amount": 45000,
      "paidAt": "2024-02-14T11:00:00Z",
      "order": {
        "id": "order-001",
        "orderNumber": "ORD-2024-0001",
        "paymentStatus": "PAID"
      }
    }
  }
}
```

---

## 👨‍🔧 SCENARIO 4: Tailor Workflow

### 1️⃣ Tailor Registration

```graphql
mutation TailorRegister {
  tailorRegister(
    input: {
      email: "aman@tailoring.com"
      password: "SecurePass123!"
      fullName: "Aman Adebayo"
      phone: "+234802345678"
      businessName: "Aman's Professional Tailoring"
    }
  ) {
    accessToken
    refreshToken
    tailor {
      id
      email
      fullName
      businessName
      accountStatus
    }
  }
}
```

---

### 2️⃣ Tailor Login

```graphql
mutation TailorLogin {
  tailorLogin(
    email: "aman@tailoring.com"
    password: "SecurePass123!"
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

✅ **Copy the `accessToken` and set it in headers**

---

### 3️⃣ View Assigned Orders

```graphql
query GetMyOrders {
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
      clientTag
      user
      measurement {
        id
        measurements {
          bust
          waist
          hip
        }
      }
      preferences {
        styles
        colors
        fabrics
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
      totalPages
    }
  }
}
```

---

### 4️⃣ Update Order to Production

```graphql
mutation UpdateStatus {
  updateOrderStatus(
    orderId: "order-001"
    newStatus: "PRODUCTION_IN_PROGRESS"
    notes: "Selected 4 outfits, starting production"
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

### 5️⃣ Mark Order as Delivered

```graphql
mutation MarkDelivered {
  markDelivered(
    orderId: "order-001"
    deliveryProof: {
      url: "https://cloudinary.com/delivery-photo.jpg"
      publicId: "vicelle/deliveries/proof-001"
    }
  ) {
    id
    status
    deliveredAt
    deliveredBy
  }
}
```

---

## 🚨 SCENARIO 5: Error Handling

### Invalid Token

```graphql
query TestAuth {
  me {
    id
    email
  }
}
```

**Without Authorization header:**
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

**Fix:** Add Authorization header with valid token

---

### Invalid Input

```graphql
mutation BadInput {
  createOrder(
    input: {
      subscriptionId: "invalid-id"
      measurementId: ""
      orderType: "INVALID_TYPE"
    }
  ) {
    id
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "Subscription not found",
      "extensions": {
        "code": "NOT_FOUND",
        "statusCode": 404
      }
    }
  ]
}
```

---

### Validation Error

```graphql
mutation ValidateEmail {
  requestActivationCode(
    email: "not-an-email"
    fullName: "Test"
  ) {
    success
    message
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "Invalid email format",
      "extensions": {
        "code": "BAD_USER_INPUT",
        "statusCode": 400
      }
    }
  ]
}
```

---

## 🔄 SCENARIO 6: Token Refresh

### When Access Token Expires

```graphql
mutation RefreshTokens {
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

✅ **Update Authorization header with new accessToken**

---

## 🧪 TESTING CHECKLIST

### Registration Flow
- [ ] Request activation code
- [ ] Verify code with correct code
- [ ] Try verify code with wrong code (should fail)
- [ ] Get user profile after auth

### Onboarding Flow
- [ ] Update profile photo
- [ ] Set delivery details
- [ ] Complete onboarding step

### Order Flow
- [ ] View subscription plans
- [ ] Create subscription
- [ ] Create measurements
- [ ] Create order
- [ ] Get order details
- [ ] Check styling window

### Payment Flow
- [ ] Initialize payment
- [ ] Verify payment

### Tailor Flow
- [ ] Register as tailor
- [ ] Login as tailor
- [ ] View assigned orders
- [ ] Update order status
- [ ] Mark order delivered

### Error Handling
- [ ] Test without authorization header
- [ ] Test with invalid token
- [ ] Test with wrong parameters
- [ ] Test rate limiting

---

## 💡 TIPS & TRICKS

1. **Use Variables** - Cleaner queries:
```graphql
mutation($input: CreateOrderInput!) {
  createOrder(input: $input) {
    id
  }
}
```

2. **Create Aliases** - Run two queries at once:
```graphql
{
  activeOrders: orders(filter: { status: "IN_PRODUCTION" }) {
    nodes { id }
  }
  completedOrders: orders(filter: { status: "COMPLETED" }) {
    nodes { id }
  }
}
```

3. **Use Fragments** - Reuse field selections:
```graphql
fragment orderFields on Order {
  id
  orderNumber
  status
  estimatedDeliveryDate
}

query {
  order(id: "order-001") {
    ...orderFields
  }
}
```

4. **Export for Testing** - Save responses for debugging

---

**Last Updated:** February 14, 2026
