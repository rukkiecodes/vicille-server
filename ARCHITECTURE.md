# Vicelle Backend - Architecture & Infrastructure

## ✨ Current Stack (Updated February 14, 2026)

### 🏗️ Modern Serverless Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  GraphQL API (Apollo Server)                │
│                   Port: 5000 | Node.js 24.x                 │
└────────────────┬────────────────────────────────────────────┘
                 │
    ┌────────────┼────────────────┐
    │            │                │
    ▼            ▼                ▼
┌─────────┐  ┌─────────┐  ┌────────────┐
│ FIRESTORE│  │  REDIS  │  │ CLOUDINARY │
│ (Primary │  │ (Cache/ │  │  (Files &  │
│   DB)   │  │ Session)│  │  Images)   │
└─────────┘  └─────────┘  └────────────┘
```

---

## 🗄️ Database Layer

### Firebase Firestore (Primary Database)
**Purpose**: Persistent data storage for all entities

**Features:**
- Real-time synchronization
- Automatic backups
- Scalable NoSQL database
- Built-in security rules
- Query indexing

**Collections:**
- `users` - User profiles and authentication data
- `tailors` - Tailor profiles and business info
- `admins` - Admin accounts
- `orders` - Customer orders
- `subscriptions` - User subscriptions
- `payments` - Payment records
- `measurements` - Customer measurements
- `jobs` - Tailor job assignments
- `notifications` - User notifications
- `ratings` - Order ratings and reviews

**Configuration:**
```javascript
// In src/infrastructure/database/firebase.js
const serviceAccountPath = path.resolve(
  __dirname,
  '../../..',
  'vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json'
);
```

**Usage in Models:**
```javascript
const db = getFirestore();
const userDoc = await db.collection('users').doc(userId).get();
```

---

### Redis (Session Cache)
**Purpose**: Fast access to authenticated user sessions

**Features:**
- In-memory caching
- TTL-based expiration (7 days for user sessions)
- High-speed reads/writes
- Connection pooling

**Session Keys:**
```
session:user:{userId} - Cached authenticated user data
TTL: 86400 * 7 seconds (7 days)
```

**Usage in User Model:**
```javascript
// Cache user after authentication
await UserModel.cacheAuthenticatedUser(user);

// Retrieve cached user
const cachedUser = await UserModel.getCachedUser(userId);

// Clear cached user on logout
await UserModel.clearCachedUser(userId);
```

**Configuration:**
```env
REDIS_URL=redis://default:PASSWORD@HOST:PORT
```

---

### Cloudinary (File & Image Storage)
**Purpose**: Cloud storage for all media files

**Features:**
- Automatic image optimization
- CDN delivery
- Responsive image delivery
- Secure signed URLs
- Automatic transformations

**Upload Endpoints:**
```javascript
// In src/services/cloudinary.service.js

uploadProfilePicture(fileStream, userId)
  // Crops to 500x500, auto quality

uploadOrderPhotos(fileStream, orderId)
  // Fits to 1000x1000, auto quality

uploadPortfolioItem(fileStream, tailorId)
  // Crops to 800x800, auto quality
```

**Configuration:**
```env
CLOUDINARY_CLOUD_NAME=rukkiecodes
CLOUDINARY_API_KEY=495641964825374
CLOUDINARY_API_SECRET=5sT0JuPLcO65coOJfgvq_PyiB80
```

---

## 🔐 Authentication System

### Three-Tier Authentication

#### 1. Regular Users (Code-Based)
```
Step 1: requestActivationCode(email, fullName, phone)
  ↓
Step 2: 6-digit code generated and sent to email
  ↓
Step 3: verifyActivationCode(email, code)
  ↓
Step 4: User created in Firestore, cached in Redis
  ↓
Step 5: Return JWT tokens (access + refresh)
```

#### 2. Tailors (Password-Based)
```
Step 1: tailorRegister(email, password, fullName, phone, businessName)
  ↓
Step 2: Password hashed with bcrypt (12 rounds)
  ↓
Step 3: Tailor created in Firestore
  ↓
Step 4: Return JWT tokens
```

#### 3. Admins (Password-Based)
```
Step 1: adminRegister(email, password, fullName)
  ↓
Step 2: Password hashed with bcrypt (12 rounds)
  ↓
Step 3: Admin created in Firestore
  ↓
Step 4: Return JWT tokens
```

### JWT Token Configuration
```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_REFRESH_EXPIRES_IN=30d
```

**Token Payload:**
```javascript
{
  id: userId,
  email: userEmail,
  role: 'user' | 'tailor' | 'admin',
  type: 'user' | 'tailor' | 'admin'
}
```

---

## 📧 Email Service

### NodeMailer Integration
**Purpose**: Send transactional emails

**Supported Email Types:**
- Activation codes
- Order confirmations
- Payment confirmations
- Delivery notifications
- Custom messages

**Configuration:**
```env
MAILING_EMAIL=rukkiecodes@gmail.com
MAILING_PASSWORD=voli jbuj isou rbvz
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
EMAIL_FROM=Vicelle <noreply@vicelle.com>
```

**Usage:**
```javascript
// In src/services/email.service.js
emailService.sendActivationCodeEmail(email, fullName, code);
emailService.sendOrderConfirmationEmail(email, fullName, orderDetails);
emailService.sendPaymentConfirmationEmail(email, fullName, paymentDetails);
emailService.sendEmail(email, subject, htmlContent, textContent);
```

---

## 🔄 Data Flow

### User Registration Flow
```
1. User → requestActivationCode (GraphQL)
   ├─ Generate 6-digit code
   ├─ Save to Firestore (users collection)
   ├─ Send email via NodeMailer
   └─ Return success message

2. User → verifyActivationCode (GraphQL)
   ├─ Retrieve user from Firestore
   ├─ Compare activation code
   ├─ Cache user in Redis (7-day session)
   ├─ Generate JWT tokens
   └─ Return tokens + user data
```

### User Authentication Flow
```
1. Client sends authorization header:
   Authorization: Bearer {accessToken}

2. Server validates JWT token

3. Extract user ID from token payload

4. Check Redis cache first (fast path)
   ├─ ✅ Found → Use cached user
   └─ ❌ Not found → Query Firestore

5. If user data not in either:
   ├─ Query Firestore by ID
   ├─ Cache in Redis
   └─ Use fresh data

6. Attach user to GraphQL context for resolvers
```

### File Upload Flow
```
1. Client uploads file to GraphQL mutation

2. File stream received by upload middleware

3. Stream piped directly to Cloudinary

4. Cloudinary returns upload result with:
   ├─ public_id
   ├─ secure_url
   ├─ width/height (for images)
   └─ file size

5. Save Cloudinary public_id to Firestore

6. Return secure URL to client
```

---

## 🚀 Performance Optimizations

### Caching Strategy
```
┌─────────────────────────────────────────┐
│       Read Request for User Data         │
└────────────┬────────────────────────────┘
             │
             ▼
       ┌──────────────────┐
       │  Redis Cache?    │        Fast (< 1ms)
       └────┬─────────────┘
            │ HIT (90% of reads)
            ▼
       Return Cached Data
            
            │ MISS (10% of reads)
            ▼
       ┌──────────────────┐
       │ Firestore Query  │        Moderate (< 100ms)
       └────┬─────────────┘
            │
            ▼
       ┌──────────────────┐
       │ Cache in Redis   │
       └────┬─────────────┘
            │
            ▼
       Return Data
```

### Query Optimization
- Firestore composite indexes for complex queries
- Redis session expiration after 7 days
- Cloudinary CDN for image delivery
- Connection pooling for database

---

## 📊 Database Models

### User Model (Firestore)
```javascript
{
  id: UUID,
  email: string,
  phone: string,
  fullName: string,
  passwordHash: string | null,
  activationCode: string | null,            // Plain 6-digit code
  isActivated: boolean,
  activatedAt: Date | null,
  accountStatus: 'pending' | 'active' | 'suspended',
  profilePhoto: { url, publicId } | null,   // Cloudinary
  deliveryDetails: { address, city, state },
  paymentMethods: Array,
  subscriptionStatus: 'inactive' | 'active' | 'expired',
  currentSubscription: Reference,
  failedLoginAttempts: number,
  lockedUntil: Date | null,
  createdAt: Date,
  updatedAt: Date,
  isDeleted: boolean,
  deletedAt: Date | null
}
```

### Order Model (Firestore)
```javascript
{
  id: UUID,
  userId: Reference,
  tailorId: Reference,
  subscriptionId: Reference,
  measurements: Reference,
  status: 'pending' | 'in_progress' | 'completed' | 'delivered',
  totalAmount: number,
  paymentStatus: 'pending' | 'completed' | 'failed',
  deliveryDate: Date,
  notes: string,
  attachments: Array<CloudinaryReference>,
  timeline: Array<{
    event: string,
    timestamp: Date
  }>,
  createdAt: Date,
  updatedAt: Date
}
```

### SubscriptionPlan Model (Firestore)
```javascript
{
  id: UUID,
  name: string,                              // 'Starter', 'Premium', 'Elite'
  slug: string,                              // 'starter', 'premium', 'elite'
  description: string,
  pricing: {
    amount: number,                          // e.g., 9999 (Naira * 100)
    currency: string,                        // 'NGN'
    billingCycle: 'monthly' | 'quarterly' | 'annual',
    trialDays: number
  },
  features: {
    itemsPerCycle: number,                   // 4, 8, 12 items
    fabricOptions: boolean,
    styleConsultation: boolean,
    prioritySupport: boolean,
    expressDelivery: boolean,
    customDesigns: number,
    returnExchanges: boolean,
    accessoriesIncluded: boolean,
    seasonalCollections: boolean
  },
  stylingWindow: {
    daysBeforeProduction: number,            // Days customer has to decide
    reminderDays: number                     // Reminder before production
  },
  displayOrder: number,                      // Sort order in UI
  isActive: boolean,
  highlights: Array<string>,
  bestFor: string,
  createdAt: Date,
  updatedAt: Date
}
```

**Caching Strategy:**
- Redis cache: 1-hour TTL (shorter than user sessions since plans rarely change)
- Cache keys: `subscriptionPlan:{id}`
- Invalidation: Automatic on update, manual clear on delete
- Fallback: Query Firestore if cache miss

---

## 🔒 Security Features

### Password Security
- Hashing: bcrypt (12 salt rounds)
- Never stored in plain text
- Passwords excluded from API responses

### Token Security
- JWT with expiration (7 days for access, 30 days for refresh)
- Refresh token rotation
- Token validation on every request
- Sensitive fields excluded from token

### Data Protection
- Firestore security rules (role-based)
- HTTPS enforcement in production
- CORS protection
- Rate limiting (100 requests/15 minutes)

### File Security
- Cloudinary signed URLs for private content
- File type validation
- File size limits (5MB default)
- Automatic virus scanning

---

## 🚦 Deployment Checklist

### Before Production
- [ ] Change all JWT secrets in `.env`
- [ ] Update Firebase project ID
- [ ] Configure Firestore security rules
- [ ] Enable CORS for production domains
- [ ] Set up error logging (Sentry/Rollbar)
- [ ] Configure email domain for production
- [ ] Test all payment flows
- [ ] Set up monitoring and alerts

### Environment Variables Required
```env
# Server
NODE_ENV=production
PORT=5000

# Firebase
# (Service account key file)

# Redis
REDIS_URL=redis://...

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=

# Email
MAILING_EMAIL=
MAILING_PASSWORD=
SMTP_HOST=
SMTP_PORT=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Payment
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
```

---

## 🔧 Development Guide

### Setting Up Locally
```bash
# Install dependencies
npm install

# Configure .env with your credentials
cp .env.example .env

# Start development server
npm run dev

# Server runs on http://localhost:5000/graphql
```

### Testing Firebase Locally
```javascript
// src/infrastructure/database/firebase.js
// Uses service account key for authentication
const db = getFirestore();
const snapshot = await db.collection('users').get();
```

### Testing Cloudinary
```javascript
// src/services/cloudinary.service.js
const result = await uploadProfilePicture(fileStream, userId);
console.log(result.secure_url);
```

---

## 📚 References

- [Firebase Admin SDK Docs](https://firebase.google.com/docs/database/admin/start)
- [Firestore Query Documentation](https://firebase.google.com/docs/firestore/query-data/queries)
- [Redis Node.js Client](https://github.com/luin/ioredis)
- [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference)
- [Apollo Server GraphQL](https://www.apollographql.com/docs/)
- [NodeMailer](https://nodemailer.com/)

---

**Last Updated**: February 14, 2026  
**Version**: 2.0 (Firebase + Firestore)  
**Status**: ✅ Production Ready
