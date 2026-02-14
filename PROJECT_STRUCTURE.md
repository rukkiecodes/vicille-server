# Vicelle Backend - MongoDB Project Structure

## Overview
This document outlines the complete project structure for the Vicelle backend system using MongoDB as the database and Cloudinary for file storage.

## Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **API**: GraphQL (Apollo Server)
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.io
- **File Storage**: Cloudinary
- **Authentication**: JWT + Activation Codes (hashed)
- **Email**: NodeMailer
- **Payment**: Paystack
- **Background Jobs**: Node-cron (scheduled tasks)

---

## Project Directory Structure

```
vicelle-backend/
├── package.json
├── package-lock.json
├── .env
├── .env.example
├── .gitignore
├── .eslintrc.json
├── .prettierrc
├── README.md
├── ARCHITECTURE.md
├── API_DOCUMENTATION.md

├── src/
│   ├── server.js                    # Main entry point - HTTP + Socket server
│   ├── app.js                       # Express app configuration
│
│   ├── config/
│   │   ├── index.js                 # Central config loader
│   │   ├── database.js              # MongoDB configuration
│   │   ├── redis.js                 # Redis configuration
│   │   ├── graphql.js               # GraphQL server setup
│   │   ├── socket.js                # Socket.io configuration
│   │   ├── cloudinary.js            # Cloudinary configuration
│   │   ├── mail.js                  # Email service configuration
│   │   ├── payment.js               # Payment gateway configuration
│   │   └── jwt.js                   # JWT configuration
│
│   ├── core/
│   │   ├── constants/
│   │   │   ├── index.js
│   │   │   ├── roles.js             # USER, TAILOR, ADMIN
│   │   │   ├── orderStatus.js       # Order lifecycle states
│   │   │   ├── paymentStatus.js     # Payment states
│   │   │   ├── subscriptionStatus.js
│   │   │   ├── tailorStatus.js
│   │   │   ├── notificationTypes.js
│   │   │   ├── measurementSources.js
│   │   │   ├── limits.js            # System limits and constraints
│   │   │   └── errors.js            # Error codes and messages
│   │   │
│   │   ├── errors/
│   │   │   ├── index.js
│   │   │   ├── AppError.js          # Base error class
│   │   │   ├── ValidationError.js
│   │   │   ├── AuthError.js
│   │   │   ├── PermissionError.js
│   │   │   ├── NotFoundError.js
│   │   │   └── ConflictError.js
│   │   │
│   │   ├── logger/
│   │   │   ├── index.js
│   │   │   └── logger.js            # Winston logger configuration
│   │   │
│   │   └── utils/
│   │       ├── index.js
│   │       ├── date.js              # Date manipulation helpers
│   │       ├── crypto.js            # Hashing and encryption
│   │       ├── randomCode.js        # Activation code generator
│   │       ├── pagination.js        # Pagination helpers
│   │       ├── validators.js        # Input validation helpers
│   │       ├── fileUpload.js        # Cloudinary upload utilities
│   │       └── response.js          # Standardized API responses
│
│   ├── modules/
│   │
│   │   ├── auth/
│   │   │   ├── auth.model.js        # Mongoose schema for auth sessions
│   │   │   ├── auth.repository.js   # Database operations
│   │   │   ├── auth.service.js      # Business logic
│   │   │   ├── auth.resolver.js     # GraphQL resolvers
│   │   │   ├── auth.schema.graphql  # GraphQL type definitions
│   │   │   └── auth.validator.js    # Input validation schemas
│   │   │
│   │   ├── users/
│   │   │   ├── user.model.js
│   │   │   ├── user.repository.js
│   │   │   ├── user.service.js
│   │   │   ├── user.resolver.js
│   │   │   ├── user.schema.graphql
│   │   │   └── user.validator.js
│   │   │
│   │   ├── tailors/
│   │   │   ├── tailor.model.js
│   │   │   ├── tailor.repository.js
│   │   │   ├── tailor.service.js
│   │   │   ├── tailor.resolver.js
│   │   │   ├── tailor.schema.graphql
│   │   │   └── tailor.validator.js
│   │   │
│   │   ├── admin/
│   │   │   ├── admin.model.js
│   │   │   ├── admin.repository.js
│   │   │   ├── admin.service.js
│   │   │   ├── admin.resolver.js
│   │   │   ├── admin.schema.graphql
│   │   │   └── admin.validator.js
│   │   │
│   │   ├── onboarding/
│   │   │   ├── onboarding.service.js
│   │   │   ├── onboarding.resolver.js
│   │   │   ├── onboarding.schema.graphql
│   │   │   └── onboarding.validator.js
│   │   │
│   │   ├── measurements/
│   │   │   ├── measurement.model.js
│   │   │   ├── measurement.repository.js
│   │   │   ├── measurement.service.js
│   │   │   ├── measurement.resolver.js
│   │   │   ├── measurement.schema.graphql
│   │   │   └── measurement.validator.js
│   │   │
│   │   ├── subscriptions/
│   │   │   ├── subscription.model.js
│   │   │   ├── subscriptionPlan.model.js
│   │   │   ├── subscription.repository.js
│   │   │   ├── subscription.service.js
│   │   │   ├── subscription.resolver.js
│   │   │   ├── subscription.schema.graphql
│   │   │   └── subscription.validator.js
│   │   │
│   │   ├── orders/
│   │   │   ├── order.model.js
│   │   │   ├── orderItem.model.js
│   │   │   ├── order.repository.js
│   │   │   ├── order.service.js
│   │   │   ├── order.resolver.js
│   │   │   ├── order.schema.graphql
│   │   │   └── order.validator.js
│   │   │
│   │   ├── special-requests/
│   │   │   ├── specialRequest.model.js
│   │   │   ├── specialRequest.repository.js
│   │   │   ├── pricing.service.js   # Dynamic pricing calculator
│   │   │   ├── specialRequest.service.js
│   │   │   ├── specialRequest.resolver.js
│   │   │   ├── specialRequest.schema.graphql
│   │   │   └── specialRequest.validator.js
│   │   │
│   │   ├── inventory/
│   │   │   ├── material.model.js
│   │   │   ├── materialIssuance.model.js
│   │   │   ├── inventory.repository.js
│   │   │   ├── inventory.service.js
│   │   │   ├── inventory.resolver.js
│   │   │   ├── inventory.schema.graphql
│   │   │   └── inventory.validator.js
│   │   │
│   │   ├── payments/
│   │   │   ├── payment.model.js
│   │   │   ├── paymentAttempt.model.js
│   │   │   ├── payment.repository.js
│   │   │   ├── payment.service.js
│   │   │   ├── standingOrder.service.js  # Bank transfer fallback
│   │   │   ├── webhook.controller.js     # Payment webhooks (REST)
│   │   │   ├── payment.resolver.js
│   │   │   ├── payment.schema.graphql
│   │   │   └── payment.validator.js
│   │   │
│   │   ├── notifications/
│   │   │   ├── notification.model.js
│   │   │   ├── notification.repository.js
│   │   │   ├── notification.service.js
│   │   │   ├── email.service.js         # NodeMailer integration
│   │   │   ├── push.service.js          # Push notification service
│   │   │   ├── notification.resolver.js
│   │   │   ├── notification.schema.graphql
│   │   │   └── templates/               # Email templates
│   │   │       ├── welcome.html
│   │   │       ├── activationCode.html
│   │   │       ├── orderStatusUpdate.html
│   │   │       └── paymentReceipt.html
│   │   │
│   │   ├── ratings/
│   │   │   ├── rating.model.js
│   │   │   ├── rating.repository.js
│   │   │   ├── rating.service.js
│   │   │   ├── rating.resolver.js
│   │   │   ├── rating.schema.graphql
│   │   │   └── rating.validator.js
│   │   │
│   │   ├── collections/
│   │   │   ├── collection.model.js      # Monthly fashion collections
│   │   │   ├── collectionItem.model.js
│   │   │   ├── collection.repository.js
│   │   │   ├── collection.service.js
│   │   │   ├── collection.resolver.js
│   │   │   ├── collection.schema.graphql
│   │   │   └── collection.validator.js
│   │   │
│   │   ├── accessories/
│   │   │   ├── accessory.model.js
│   │   │   ├── accessory.repository.js
│   │   │   ├── accessory.service.js
│   │   │   ├── accessory.resolver.js
│   │   │   ├── accessory.schema.graphql
│   │   │   └── accessory.validator.js
│   │   │
│   │   ├── jobs/
│   │   │   ├── job.model.js             # Tailor job assignments
│   │   │   ├── job.repository.js
│   │   │   ├── job.service.js
│   │   │   ├── assignment.service.js    # Auto/manual assignment logic
│   │   │   ├── job.resolver.js
│   │   │   ├── job.schema.graphql
│   │   │   └── job.validator.js
│   │   │
│   │   ├── quality-control/
│   │   │   ├── qc.model.js
│   │   │   ├── qc.repository.js
│   │   │   ├── qc.service.js
│   │   │   ├── qc.resolver.js
│   │   │   ├── qc.schema.graphql
│   │   │   └── qc.validator.js
│   │   │
│   │   ├── payouts/
│   │   │   ├── payout.model.js          # Tailor weekly payouts
│   │   │   ├── payout.repository.js
│   │   │   ├── payout.service.js
│   │   │   ├── payout.resolver.js
│   │   │   ├── payout.schema.graphql
│   │   │   └── payout.validator.js
│   │   │
│   │   ├── analytics/
│   │   │   ├── analytics.service.js     # Business metrics
│   │   │   ├── analytics.resolver.js
│   │   │   └── analytics.schema.graphql
│   │   │
│   │   └── audit/
│   │       ├── audit.model.js           # Immutable audit logs
│   │       ├── audit.repository.js
│   │       ├── audit.service.js
│   │       ├── audit.listener.js        # Event-driven logging
│   │       ├── audit.resolver.js
│   │       └── audit.schema.graphql
│
│   ├── graphql/
│   │   ├── index.js                     # GraphQL server setup
│   │   ├── schema.js                    # Schema stitching/merging
│   │   ├── resolvers.js                 # Resolver merging
│   │   ├── context.js                   # Request context builder
│   │   ├── directives/                  # Custom directives
│   │   │   ├── auth.directive.js
│   │   │   └── role.directive.js
│   │   └── scalars/                     # Custom scalar types
│   │       ├── DateTime.js
│   │       └── Upload.js
│
│   ├── sockets/
│   │   ├── index.js                     # Socket.io initialization
│   │   ├── events.js                    # Event name constants
│   │   ├── middleware/
│   │   │   └── auth.socket.middleware.js
│   │   ├── namespaces/
│   │   │   ├── user.socket.js
│   │   │   ├── tailor.socket.js
│   │   │   └── admin.socket.js
│   │   └── handlers/
│   │       ├── order.handler.js
│   │       ├── notification.handler.js
│   │       └── job.handler.js
│
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── mongodb.js               # MongoDB connection manager
│   │   │   ├── indexes.js               # Database indexes setup
│   │   │   └── seeders/
│   │   │       ├── index.js
│   │   │       ├── users.seeder.js
│   │   │       ├── admins.seeder.js
│   │   │       ├── collections.seeder.js
│   │   │       └── subscriptionPlans.seeder.js
│   │   │
│   │   ├── jobs/
│   │   │   ├── scheduler.js             # Node-cron scheduler
│   │   │   ├── emailQueue.js            # Simple in-memory queue
│   │   │   └── tasks/
│   │   │       ├── sendEmail.task.js
│   │   │       ├── retryPayment.task.js
│   │   │       └── processPayouts.task.js
│   │   │
│   │   └── storage/
│   │       ├── cloudinary.js            # Cloudinary service
│   │       └── upload.service.js        # File upload abstraction
│
│   ├── middlewares/
│   │   ├── auth.middleware.js           # JWT verification
│   │   ├── role.middleware.js           # RBAC enforcement
│   │   ├── error.middleware.js          # Global error handler
│   │   ├── rateLimit.middleware.js      # Rate limiting
│   │   ├── validation.middleware.js     # Request validation
│   │   ├── requestLogger.middleware.js  # Request logging
│   │   └── upload.middleware.js         # File upload handling
│
│   ├── routes/
│   │   ├── index.js                     # Route aggregator
│   │   ├── webhooks.routes.js           # Payment webhooks (REST)
│   │   └── health.routes.js             # Health check endpoint
│
│   └── jobs/
│       ├── scheduledJobs.js             # Cron-like scheduled tasks
│       ├── paymentRetry.job.js
│       ├── weeklyPayout.job.js
│       ├── subscriptionRenewal.job.js
│       └── capacityAdjustment.job.js    # Auto-reduce tailor capacity
│
├── logs/
│   ├── .gitkeep
│   └── app.log
│
├── uploads/
│   └── .gitkeep
│
└── tests/
    ├── setup.js
    ├── teardown.js
    ├── helpers/
    │   ├── testData.js
    │   └── factories/
    │       ├── user.factory.js
    │       ├── order.factory.js
    │       └── tailor.factory.js
    │
    ├── unit/
    │   ├── services/
    │   ├── repositories/
    │   └── utils/
    │
    ├── integration/
    │   ├── auth.test.js
    │   ├── orders.test.js
    │   ├── payments.test.js
    │   └── subscriptions.test.js
    │
    └── e2e/
        ├── userFlow.test.js
        ├── tailorFlow.test.js
        └── adminFlow.test.js
```

---

## Key Architectural Changes from PostgreSQL to MongoDB

### 1. **Schema Definition**
- **Before**: Prisma schema files
- **After**: Mongoose models with embedded schemas
- Benefit: More flexible schema evolution, embedded documents

### 2. **Relationships**
- **One-to-Many**: Use refs and populate
- **Many-to-Many**: Array of ObjectIds with refs
- **Embedded Documents**: For tightly coupled data (e.g., payment methods in user)

### 3. **Transactions**
- MongoDB supports multi-document ACID transactions (v4.0+)
- Use sessions for critical operations (payments, order status changes)

### 4. **Indexing**
- Define indexes in Mongoose schemas
- Compound indexes for common queries
- TTL indexes for session/cache expiry

### 5. **Aggregation**
- Replace complex SQL JOINs with MongoDB aggregation pipeline
- Better performance for analytics and reporting

---

## Module Organization Pattern

Each module follows this structure:

```
module-name/
├── *.model.js           # Mongoose schema and model
├── *.repository.js      # Database access layer
├── *.service.js         # Business logic
├── *.resolver.js        # GraphQL resolvers
├── *.schema.graphql     # GraphQL type definitions
└── *.validator.js       # Input validation (Joi)
```

**Separation of Concerns:**
- **Model**: Data structure and database schema
- **Repository**: CRUD operations, queries
- **Service**: Business rules, orchestration
- **Resolver**: GraphQL entry points
- **Validator**: Input sanitization and validation

---

## Next Steps

1. **Setup package.json dependencies**
2. **Configure environment variables**
3. **Create MongoDB connection manager**
4. **Define Mongoose models**
5. **Implement repository pattern**
6. **Setup GraphQL server**
7. **Configure Cloudinary integration**
8. **Implement authentication flow**
9. **Setup Socket.io namespaces**
10. **Create background job workers**

---

## Notes

- All models use timestamps (createdAt, updatedAt)
- Soft deletes implemented via `isDeleted` flag
- Audit trail captures all critical state changes
- File uploads go directly to Cloudinary (no local storage)
- MongoDB sessions used for multi-document transactions
- Simple in-memory queue for background tasks (can be replaced with proper queue later)
- Rate limiting using in-memory store (express-rate-limit default)
