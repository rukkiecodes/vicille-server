# Vicelle Backend - MongoDB Edition

> Subscription-based fashion & tailoring platform backend built with Node.js, MongoDB, GraphQL, and Socket.io

## 🚀 Technology Stack

### Core Technologies
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **API**: GraphQL (Apollo Server 4)
- **Database**: MongoDB 6+ with Mongoose ODM
- **Real-time**: Socket.io
- **Authentication**: JWT (JSON Web Tokens)

### Infrastructure
- **File Storage**: Cloudinary
- **Email Service**: NodeMailer (SMTP)
- **Payment Gateway**: Paystack
- **Background Tasks**: Node-cron
- **Session Storage**: MongoDB (with TTL indexes)

### Security & Utilities
- **Password Hashing**: bcryptjs
- **Input Validation**: Joi
- **Security Headers**: Helmet
- **CORS**: cors
- **Rate Limiting**: express-rate-limit
- **Logging**: Winston
- **File Upload**: Multer

## 📋 Prerequisites

- Node.js 18.x or higher
- MongoDB 6.x or higher
- npm or yarn
- Cloudinary account
- Paystack account
- SMTP email service

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

### 3. Setup environment variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server
NODE_ENV=development
PORT=4000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/vicelle

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Paystack
PAYSTACK_SECRET_KEY=sk_test_xxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### 4. Start MongoDB

```bash
# Using MongoDB service
sudo systemctl start mongod

# Or using Docker
docker run -d -p 27017:27017 --name mongodb mongo:6
```

### 5. Run the application

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## 📁 Project Structure

```
vicelle-backend/
├── src/
│   ├── config/           # Configuration files
│   ├── core/             # Core utilities, errors, constants
│   ├── modules/          # Feature modules (users, orders, etc.)
│   ├── graphql/          # GraphQL schema and resolvers
│   ├── sockets/          # Socket.io real-time features
│   ├── infrastructure/   # Database, storage, jobs
│   ├── middlewares/      # Express middlewares
│   ├── routes/           # REST routes (webhooks)
│   └── server.js         # Application entry point
├── tests/                # Test files
├── logs/                 # Application logs
└── package.json
```

## 🔑 Key Features

### User/Client Features
- ✅ Passwordless authentication (activation codes)
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
