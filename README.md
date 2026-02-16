# Vicelle Backend - GraphQL API

> Subscription-based fashion & tailoring platform backend built with Node.js, Firebase Firestore, GraphQL, and Cloudinary

## 🚀 Technology Stack

### Core Technologies
- **Runtime**: Node.js 24.x (v24.13.1)
- **Framework**: Express.js 4.22.1
- **API**: GraphQL 4.12.2 (Apollo Server)
- **Database**: Firebase Firestore (Primary Storage)
- **Cache**: Redis 5.10.0 (Session Management)
- **Files**: Cloudinary (Images & Documents)

### Infrastructure
- **Authentication**: JWT + Activation Codes (Firestore)
- **Email Service**: NodeMailer (SMTP via Gmail)
- **Payment Gateway**: Paystack
- **Security**: bcryptjs, Helmet, CORS, Rate Limiting
- **Logging**: Winston

### Key Features
- ✅ Real-time Firestore queries with indexing
- ✅ Redis session caching (7-day TTL)
- ✅ Cloudinary CDN for global image delivery
- ✅ Automatic backups with Firestore
- ✅ GraphQL introspection with Apollo Sandbox
- ✅ Three-tier authentication (Users, Tailors, Admins)

## 📋 Prerequisites

- Node.js 24.x or higher
- Firebase account with Firestore
- Redis instance (cloud or local)
- Cloudinary account
- Gmail account (for email)
- Paystack account (optional)

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd vicelle-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Download Firebase Service Account Key
- Go to Firebase Console
- Project Settings → Service Account
- Download JSON key
- Place as `vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json` in project root

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with:
```env
# Server
NODE_ENV=development
PORT=5000

# Firebase (via service account)
# File: vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json

# Redis
REDIS_URL=redis://default:PASSWORD@HOST:PORT

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=30d

# Email
MAILING_EMAIL=your-email@gmail.com
MAILING_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
EMAIL_FROM=Vicelle <noreply@vicelle.com>

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 5. Start development server

```bash
npm run dev
```

Server starts at: **https://vicille-server.vercel.app**
GraphQL API: **https://vicille-server.vercel.app/graphql**

## 📚 Documentation

Start here for complete information:

| Document | Purpose |
|----------|---------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Complete system architecture & data flow |
| **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** | Redis → Firestore migration details |
| **[GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md)** | Comprehensive API reference (1800+ lines) |
| **[GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md)** | Step-by-step workflow examples |
| **[GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md)** | 6 real-world testing scenarios |
| **[GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md)** | All queries & mutations by module |
| **[GRAPHQL_DOCUMENTATION_INDEX.md](GRAPHQL_DOCUMENTATION_INDEX.md)** | Navigation guide for all docs |

## 📁 Project Structure

```
vicelle-backend/
├── src/
│   ├── config/              # Configuration management
│   ├── core/
│   │   ├── constants/       # App constants
│   │   ├── errors/          # Custom error classes
│   │   ├── logger/          # Winston logging
│   │   └── utils/           # Utilities (crypto, date, etc.)
│   ├── modules/             # Feature modules
│   │   ├── users/           # User models & logic
│   │   ├── orders/          # Order management
│   │   ├── subscriptions/   # Subscription handling
│   │   ├── payments/        # Payment processing
│   │   ├── tailors/         # Tailor profiles
│   │   ├── measurements/    # Customer measurements
│   │   └── ...
│   ├── graphql/
│   │   ├── resolvers/       # Query & mutation resolvers
│   │   ├── typeDefs/        # GraphQL type definitions
│   │   └── helpers.js       # GraphQL utilities
│   ├── services/            # Business logic services
│   │   ├── email.service.js
│   │   └── cloudinary.service.js
│   ├── infrastructure/
│   │   └── database/
│   │       ├── firebase.js  # Firestore initialization
│   │       ├── redis.js     # Redis setup
│   │       └── indexes.js   # Database indexes
│   ├── middlewares/         # Express middlewares
│   ├── routes/              # REST API routes (webhooks)
│   ├── app.js               # Express app setup
│   └── server.js            # Server entry point
├── logs/                    # Application logs
├── ARCHITECTURE.md          # System architecture
├── MIGRATION_GUIDE.md       # Migration documentation
├── GRAPHQL_*.md             # GraphQL API docs
└── package.json
```

## 🔑 Key Features

### User/Client Features
- ✅ Passwordless authentication (6-digit activation codes)
- ✅ Subscription management
- ✅ Style selection from collections
- ✅ Measurement submission
- ✅ Order tracking with real-time updates
- ✅ Special requests (one-off orders)
- ✅ Payment processing with retry logic
- ✅ Accessory ordering
- ✅ Multi-device support

### Tailor Features
- ✅ Job assignment (auto/manual)
- ✅ Material acknowledgment
- ✅ Progress tracking
- ✅ Proof of completion uploads
- ✅ Performance metrics
- ✅ Weekly payout tracking

### Admin Features
- ✅ Tailor verification workflow
- ✅ Job assignment/reassignment
- ✅ Material inventory management
- ✅ QC review process
- ✅ Order status management
- ✅ Payment verification
- ✅ Payout processing
- ✅ Analytics dashboard
- ✅ System monitoring

## 🔄 Background Tasks

The system uses **node-cron** for scheduled tasks:

- **Daily Tasks**:
  - Process pending emails
  - Retry failed payments
  - Send styling window reminders
  
- **Weekly Tasks**:
  - Process tailor payouts (Fridays)
  - Adjust tailor capacity based on performance
  - Clean up old notifications

- **Monthly Tasks**:
  - Generate new production cycles
  - Subscription renewals

## 🗄️ Database Collections

### Core Collections
- **users** - Client accounts
- **tailors** - Tailor accounts
- **admins** - Admin accounts
- **sessions** - Active user sessions

### Business Collections
- **subscriptions** - User subscriptions
- **subscriptionPlans** - Available packages
- **orders** - Production orders
- **orderItems** - Individual garments
- **jobs** - Tailor assignments
- **measurements** - User measurements

### Supporting Collections
- **payments** - Payment transactions
- **paymentAttempts** - Payment retry logs
- **payouts** - Tailor payouts
- **materials** - Inventory
- **materialIssuances** - Material distribution
- **qcReviews** - Quality control
- **ratings** - Tailor ratings
- **notifications** - User notifications
- **auditLogs** - Audit trail
- **emailQueue** - Pending emails

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm test -- --coverage
```

## 🚀 Deployment

### Using Docker

```bash
# Build image
docker build -t vicelle-backend .

# Run container
docker run -p 4000:4000 --env-file .env vicelle-backend
```

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/server.js --name vicelle-backend

# Monitor
pm2 monit

# View logs
pm2 logs vicelle-backend
```

## 📊 API Documentation

### GraphQL Playground

When running in development mode, access GraphQL Playground at:

```
http://localhost:4000/graphql
```

### REST Endpoints

- **POST** `/webhooks/paystack` - Paystack webhook handler
- **GET** `/health` - Health check endpoint

## 🔐 Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- Input validation and sanitization
- Rate limiting
- CORS configuration
- Helmet security headers
- Password hashing with bcrypt
- Session management with TTL

## 📝 Environment Variables

See `.env.example` for all available configuration options.

## 🐛 Debugging

Enable debug logs:

```bash
LOG_LEVEL=debug npm run dev
```

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Submit a pull request

## 📄 License

ISC

## 👥 Authors

Vicelle Team

## 📞 Support

For support, email support@vicelle.com

---

**Built with ❤️ for the Vicelle platform**
