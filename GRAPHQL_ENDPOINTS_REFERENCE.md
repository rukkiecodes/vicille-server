# Vicelle GraphQL API - Complete Endpoint Reference

## 📑 All Available Queries & Mutations by Module

### 🏗️ Current Infrastructure
- **API Endpoint**: `http://localhost:5000/graphql`
- **Primary Database**: Firebase Firestore
- **Session Cache**: Redis
- **File Storage**: Cloudinary
- **Email Service**: NodeMailer (SMTP)

---

## 🔐 AUTHENTICATION MODULE

### Queries
| Query | Description | Auth Required |
|-------|-------------|---|
| `me` | Get current user profile | ✅ Yes |
| `myTailor` | Get current tailor profile | ✅ Yes |
| `myAdmin` | Get current admin profile | ✅ Yes |

### Mutations
| Mutation | Purpose | Input | Returns |
|----------|---------|-------|---------|
| `requestActivationCode` | Send activation code to email | `email`, `fullName?`, `phone?` | `{success, message}` |
| `verifyActivationCode` | Verify code & get tokens | `email`, `code` | `{accessToken, refreshToken, user}` |
| `tailorRegister` | Register new tailor | `{email, password, fullName, phone, businessName?}` | `{accessToken, refreshToken, tailor}` |
| `tailorLogin` | Login tailor with password | `email`, `password` | `{accessToken, refreshToken, tailor}` |
| `adminRegister` | Register new admin | `{email, password, fullName}` | `{accessToken, refreshToken, admin}` |
| `adminLogin` | Login admin with password | `email`, `password` | `{accessToken, refreshToken, admin}` |
| `refreshToken` | Get new access token | `refreshToken` | `{accessToken, refreshToken}` |
| `logout` | Invalidate current session | - | `{success, message}` |

---

## 👤 USER MODULE

### Queries
| Query | Description | Parameters | Returns |
|-------|-------------|-----------|---------|
| `me` | Get authenticated user | - | User object |
| `user` | Get user by ID | `id: ID!` | User object |
| `users` | Get all users with filters | `filter?`, `pagination?` | `{nodes[], pageInfo}` |

### Mutations
| Mutation | Purpose | Input | Returns |
|----------|---------|-------|---------|
| `updateUserProfile` | Update user info | `input: {fullName?, phone?, profilePhoto?}` | User object |
| `updateDeliveryDetails` | Set delivery address | `input: {address!, phone!, landmark?, nearestBusStop?}` | User with deliveryDetails |
| `updatePreferences` | Update style preferences | `input: {styles[], colors[], fabrics[], lifestyle?}` | User with preferences |
| `completeOnboardingStep` | Set immutable profile data | `step, data: {dateOfBirth?, gender?, height?, preferences?}` | User with onboardingCompleted |
| `deactivateAccount` | Deactivate user account | - | `{success, message}` |
| `reactivateAccount` | Reactivate deactivated account | - | `{success, message}` |

---

## 📦 ORDER MODULE

### Queries
| Query | Description | Parameters | Returns |
|-------|-------------|-----------|---------|
| `order` | Get single order | `id: ID!` | Order object |
| `orders` | List orders with filters | `filter?`, `pagination?` | `{nodes[], pageInfo}` |
| `myOrders` | Get user's orders | `filter?`, `pagination?` | `{nodes[], pageInfo}` |
| `orderByNumber` | Get order by order number | `orderNumber: String!` | Order object |

### Mutations
| Mutation | Purpose | Input | Returns |
|----------|---------|-------|---------|
| `createOrder` | Create new order | `input: {user!, subscription?, measurement?, orderType!, deliveryMethod?, deliveryAddress?, notes?, items?}` | Order with id, status, totalAmount |
| `updateOrderStatus` | Change order status (tailor) | `orderId!, newStatus!, notes?` | Order with statusHistory |
| `cancelOrder` | Cancel styling phase order | `orderId!, reason?` | `{success, refundAmount}` |
| `completeProduction` | Mark production done | `orderId!` | Order with new status |
| `markDelivered` | Confirm order delivery | `orderId!, deliveryProof?` | Order with deliveredAt |
| `updateDeliveryAddress` | Change delivery location | `orderId!, address!, phone!, landmark?` | Order with updated address |

---

## 📏 MEASUREMENT MODULE

### Queries
| Query | Description | Parameters | Returns |
|-------|-------------|-----------|---------|
| `measurement` | Get single measurement | `id: ID!` | Measurement object |
| `measurements` | List measurements | `userId?, pagination?` | `{nodes[], pageInfo}` |
| `latestMeasurement` | Get user's latest | - | Measurement object |

### Mutations
| Mutation | Purpose | Input | Returns |
|----------|---------|-------|---------|
| `createMeasurement` | Record new measurements | `input: {measurements{}, notes?}` | Measurement object |
| `updateMeasurement` | Update existing measurement | `id!, input: {measurements{}, notes?}` | Measurement object |
| `deleteMeasurement` | Delete measurement | `id!` | `{success, message}` |

---

## 💳 PAYMENT MODULE

### Queries
| Query | Description | Parameters | Returns |
|-------|-------------|-----------|---------|
| `payment` | Get single payment | `id: ID!` | Payment object |
| `payments` | List payments with filters | `filter?`, `pagination?` | `{nodes[], pageInfo}` |
| `paymentHistory` | Get user payment history | `userId?, pagination?` | `{nodes[], pageInfo}` |
| `paymentStats` | Get payment statistics | `dateRange?, status?` | Payment stats |

### Mutations
| Mutation | Purpose | Input | Returns |
|----------|---------|-------|---------|
| `initializePayment` | Start payment process | `input: {orderId!, amount!, paymentMethod!, currency?}` | `{id, reference, authUrl}` |
| `verifyPayment` | Confirm payment success | `paymentId!` | Payment object with status |
| `refundPayment` | Process refund | `paymentId!, reason?` | `{success, refundId, amount}` |

---

## 🎫 SUBSCRIPTION MODULE

### Queries
| Query | Description | Parameters | Returns |
|-------|-------------|-----------|---------|
| `subscriptionPlan` | Get single plan | `id: ID!` | SubscriptionPlan object |
| `subscriptionPlans` | List all plans | - | Array of plans |
| `subscription` | Get user's subscription | `id: ID!` | Subscription object |
| `subscriptions` | List subscriptions | `filter?`, `pagination?` | `{nodes[], pageInfo}` |
| `mySubscription` | Get current user subscription | - | Subscription object |

### Mutations
| Mutation | Purpose | Input | Returns |
|----------|---------|-------|---------|
| `createSubscription` | Subscribe to plan | `input: {planId!, paymentMethod!}` | Subscription object |
| `cancelSubscription` | Cancel active subscription | `subscriptionId!, reason?` | `{success, endDate}` |
| `pauseSubscription` | Pause subscription | `subscriptionId!` | Subscription with status |
| `resumeSubscription` | Resume paused subscription | `subscriptionId!` | Subscription with status |
| `upgradeSubscription` | Change to better plan | `subscriptionId!, newPlanId!` | Subscription object |

---

## 👨‍🔧 TAILOR MODULE

### Queries
| Query | Description | Parameters | Returns |
|-------|-------------|-----------|---------|
| `tailor` | Get tailor by ID | `id: ID!` | Tailor object |
| `tailors` | List all tailors | `filter?`, `pagination?` | `{nodes[], pageInfo}` |
| `myTailor` | Get authenticated tailor | - | Tailor object |
| `tailorOrders` | Get tailor's assigned orders | `filter?`, `pagination?` | `{nodes[], pageInfo}` |
| `tailorStats` | Get tailor statistics | - | Tailor stats |

### Mutations
| Mutation | Purpose | Input | Returns |
|----------|---------|-------|---------|
| `updateTailorProfile` | Update tailor info | `input: {fullName?, phone?, businessName?, specialties?}` | Tailor object |
| `updateTailorAvailability` | Set availability | `input: {available!, dayOff?, restDays[]}` | Tailor object |
| `updateSpecialties` | Update skills | `specialties[]` | Tailor with specialties |
| `updateCapacity` | Set production capacity | `input: {ordersPerMonth, turnaroundDays}` | Tailor object |
| `addKYCDocument` | Upload KYC docs | `input: {documentType!, url, publicId}` | KYC object |
| `verifySelfKYC` | Submit for verification | - | `{success, message}` |

---

## 📊 ADMIN MODULE

### Queries
| Query | Description | Parameters | Returns |
|-------|-------------|-----------|---------|
| `adminStats` | Get platform statistics | - | Admin stats |
| `userStats` | Get user analytics | `dateRange?` | User statistics |
| `orderStats` | Get order analytics | `dateRange?` | Order statistics |
| `paymentStats` | Get payment analytics | `dateRange?` | Payment statistics |
| `adminLogs` | Get activity logs | `filter?`, `pagination?` | Logs |

---

## 🔍 FILTER EXAMPLES

### Order Filter
```graphql
filter: {
  status: "IN_PRODUCTION"        # STYLING_IN_PROGRESS, PRODUCTION_IN_PROGRESS, etc.
  paymentStatus: "PAID"          # PAID, PENDING, PARTIAL
  dateRange: {                   # Optional
    startDate: "2024-01-01"
    endDate: "2024-12-31"
  }
}
```

### Payment Filter
```graphql
filter: {
  status: "COMPLETED"            # COMPLETED, PENDING, FAILED
  minAmount: 10000
  maxAmount: 1000000
}
```

### User Filter
```graphql
filter: {
  accountStatus: "ACTIVE"        # ACTIVE, PENDING, SUSPENDED
  subscriptionStatus: "ACTIVE"   # ACTIVE, INACTIVE
  isOnboarded: true
}
```

---

## 📄 PAGINATION STANDARD

All list queries support pagination:

```graphql
pagination: {
  page: 1                        # Starting page (default: 1)
  limit: 20                      # Items per page (default: 20, max: 100)
}
```

**Response format:**
```graphql
{
  nodes: [...]                   # Array of items
  pageInfo: {
    total: 500                   # Total items
    totalPages: 25               # Total pages
    hasNextPage: true            # Has more pages
    currentPage: 1
  }
}
```

---

## 🔑 COMMON INPUT TYPES

### HeightInput
```graphql
height: {
  value: 5.9                     # Float
  unit: "feet"                   # "feet", "cm"
  source: "MANUAL"               # "MANUAL", "TAILOR", "PROFESSIONAL"
}
```

### PreferencesInput
```graphql
preferences: {
  styles: ["CASUAL", "FORMAL"]   # Array of style types
  colors: ["BLUE", "BLACK"]      # Array of colors
  fabrics: ["COTTON", "SILK"]    # Array of fabrics
  lifestyle: "PROFESSIONAL"      # Lifestyle category
}
```

### MeasurementsInput
```graphql
measurements: {
  bust: 38
  waist: 32
  hip: 40
  shoulder: 18
  sleeve: 33
  inseam: 32
  neckSize: 15.5
  length: 60
}
```

### DeliveryDetailsInput
```graphql
deliveryDetails: {
  address: "123 Main St"         # Required
  phone: "+234801234567"         # Required
  landmark: "Near Market"        # Optional
  nearestBusStop: "Station"      # Optional
}
```

---

## 🎯 COMMON RESPONSE EXAMPLES

### User Object
```graphql
{
  id: "uuid"
  email: "john@example.com"
  fullName: "John Doe"
  phone: "+234801234567"
  dateOfBirth: "1995-05-15"
  gender: "MALE"
  height {
    value: 5.9
    unit: "feet"
  }
  preferences {
    styles: ["CASUAL"]
    colors: ["BLUE"]
    fabrics: ["COTTON"]
  }
  profilePhoto {
    url: "https://..."
    publicId: "vicelle/..."
  }
  deliveryDetails {
    address: "123 Main St"
    phone: "+234801234567"
    landmark: "Near Market"
  }
  accountStatus: "ACTIVE"
  subscriptionStatus: "ACTIVE"
  onboardingCompleted: true
  createdAt: "2024-01-15T10:30:00Z"
  updatedAt: "2024-02-14T15:45:00Z"
}
```

### Order Object
```graphql
{
  id: "uuid"
  orderNumber: "ORD-2024-001"
  clientTag: "JD-001"
  status: "PRODUCTION_IN_PROGRESS"
  user: "user-uuid"
  measurement: "measurement-uuid"
  productionCycle {
    cycleNumber: 1
    month: "FEBRUARY"
    year: 2024
  }
  stylingWindow {
    isOpen: true
    openedAt: "2024-02-01T00:00:00Z"
    closedAt: "2024-02-10T00:00:00Z"
  }
  estimatedDeliveryDate: "2024-02-28T00:00:00Z"
  totalAmount: 50000
  amountPaid: 50000
  paymentStatus: "PAID"
  deliveryAddress {
    address: "123 Main St"
    phone: "+234801234567"
  }
  statusHistory: [
    {
      status: "STYLING_IN_PROGRESS"
      changedAt: "2024-02-01T10:00:00Z"
      notes: "Order created"
    }
  ]
  createdAt: "2024-02-01T10:00:00Z"
  updatedAt: "2024-02-14T15:45:00Z"
}
```

---

## ⏱️ TOKEN EXPIRATION

- **Access Token:** 7 days
- **Refresh Token:** 30 days

When access token expires:
1. Call `refreshToken(refreshToken)` mutation
2. Get new `accessToken` and `refreshToken`
3. Update Authorization header

---

## 🚫 HTTP STATUS CODES

- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (permission denied)
- `404` - Not Found
- `422` - Unprocessable Entity (validation error)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## 📱 AUTHORIZATION HEADER FORMAT

```
Authorization: Bearer <accessToken>
```

Example:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLXV1aWQiLCJpYXQiOjE2NDY2MzQ4MDAsImV4cCI6MTY0NzIzOTYwMH0.signature
```

---

## 🔍 INTROSPECTION

To see full schema documentation:
1. Open Apollo Sandbox: `http://localhost:4000/graphql`
2. Click "Docs" (📖) icon
3. Browse all types, queries, and mutations
4. View detailed field descriptions

---

**Last Updated:** February 14, 2026
**API Version:** 1.0
**Base URL:** http://localhost:4000/graphql
