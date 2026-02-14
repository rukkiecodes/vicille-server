# ✅ Quick Reference Checklist

## 🚀 Getting Started

### First Time Setup
- [ ] Clone repository
- [ ] Run `npm install`
- [ ] Download Firebase service account JSON
- [ ] Create `.env` file with all required variables
- [ ] Start server with `npm run dev`
- [ ] Open http://localhost:5000/graphql

### Running Tests
- [ ] Open Apollo Sandbox at http://localhost:5000/graphql
- [ ] Copy first query from GRAPHQL_TESTING_GUIDE.md
- [ ] Click "Play" button
- [ ] Verify response matches expected output

---

## 📚 Documentation Quick Links

### Need to...

**Understand the System**
→ Read [ARCHITECTURE.md](ARCHITECTURE.md)

**See How User Registration Works**
→ Review [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - User Authentication Flow section

**Find a GraphQL Query**
→ Check [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md)

**Test an Endpoint**
→ Look up exact query in [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md)

**Learn Complete Workflow**
→ Follow [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md)

**Understand Architecture**
→ Read [ARCHITECTURE.md](ARCHITECTURE.md)

**See How Data Flows**
→ Check [ARCHITECTURE.md](ARCHITECTURE.md) Data Flow section

**Migrate Another Model**
→ Follow pattern in [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) Migration Pattern section

**Troubleshoot Issues**
→ Check [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) Troubleshooting section

**Deploy to Production**
→ Review [ARCHITECTURE.md](ARCHITECTURE.md) Deployment Checklist

---

## 🔧 Common Tasks

### Authenticate a User
```graphql
# Step 1: Request activation code
mutation {
  requestActivationCode(
    email: "user@example.com"
    fullName: "User Name"
    phone: "+2349123456789"
  ) {
    success
    message
  }
}

# Step 2: Verify code (check email for 6-digit code)
mutation {
  verifyActivationCode(
    email: "user@example.com"
    code: "123456"
  ) {
    accessToken
    refreshToken
    user { id email }
  }
}

# Step 3: Set Authorization header
# Headers → Authorization: Bearer {accessToken}
```

### Get Authenticated User
```graphql
query {
  me {
    id
    email
    fullName
    accountStatus
  }
}
```

### Upload Profile Picture
```graphql
# See GRAPHQL_API_DOCUMENTATION.md for complete upload example
mutation {
  updateProfile(
    input: {
      profilePhoto: # File upload here
    }
  ) {
    success
    user { profilePhoto }
  }
}
```

---

## 🏗️ System Architecture Quick View

```
Application Layer
    ↓
GraphQL API (Apollo Server) - Port 5000
    ↓
    ├─→ Firestore (Primary Database)
    │   └─ All persistent data
    │
    ├─→ Redis (Session Cache)
    │   └─ Authenticated user data (7-day TTL)
    │
    └─→ Cloudinary (File Storage)
        └─ Profile pictures, order photos, portfolio items
```

---

## 🔑 Key Concepts

### Authentication (Users)
- Users sign up with email + phone + name (no password)
- 6-digit activation code sent to email
- Code verified in GraphQL mutation
- JWT tokens returned (7d access, 30d refresh)

### Session Caching
- Users cached in Redis after auth (7 days)
- Fast subsequent requests from cache
- Cache cleared on logout
- Falls back to Firestore on cache miss

### File Storage
- All images uploaded to Cloudinary
- Automatic optimization and resizing
- Returns secure URLs
- CDN delivery worldwide

### Error Handling
- GraphQL errors include error codes
- Check GRAPHQL_API_DOCUMENTATION.md error section
- Auth errors: UNAUTHENTICATED (401)
- Validation errors: INVALID_INPUT (400)
- Server errors: INTERNAL_SERVER_ERROR (500)

---

## 🧪 Testing Workflow

### Manual Testing
1. Open Apollo Sandbox: http://localhost:5000/graphql
2. Choose scenario from GRAPHQL_TESTING_GUIDE.md
3. Copy mutation/query
4. Paste into Sandbox
5. Set headers if needed (Authorization: Bearer {token})
6. Click Play
7. Verify response matches expected output

### Automated Testing (Future)
```bash
npm run test              # Run all tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e          # End-to-end tests
```

---

## 📊 Database Collections (Firestore)

| Collection | Purpose | Example |
|-----------|---------|---------|
| users | User profiles | {email, phone, fullName, ...} |
| tailors | Tailor accounts | {email, businessName, rating, ...} |
| admins | Admin accounts | {email, permissions, ...} |
| orders | Customer orders | {userId, tailorId, status, ...} |
| subscriptions | User subscriptions | {userId, plan, expiresAt, ...} |
| payments | Payment records | {orderId, amount, status, ...} |
| measurements | Customer measurements | {userId, measurements, ...} |
| notifications | User alerts | {userId, type, read, ...} |

---

## 🔐 Environment Variables Needed

```env
# Server
NODE_ENV=development
PORT=5000

# Firebase (automatic via service account JSON file)

# Redis
REDIS_URL=redis://...

# JWT
JWT_SECRET=...
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=30d

# Email
MAILING_EMAIL=...
MAILING_PASSWORD=...
SMTP_HOST=...
SMTP_PORT=...

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

---

## 🆘 Help & Support

### Server Won't Start?
1. Check .env file for all required variables
2. Verify Firebase service account JSON exists
3. Check port 5000 not in use
4. Review console error message

### Firebase Connection Error?
1. Check service account JSON path
2. Verify Firebase project ID in JSON
3. Check Firestore is enabled in Firebase Console

### Redis Connection Error?
1. Verify REDIS_URL in .env
2. Test connection: `redis-cli -u {REDIS_URL}`
3. Check firewall rules

### Email Not Sending?
1. Verify MAILING_EMAIL is Gmail app password (not regular password)
2. Check "Less secure apps" allowed in Gmail
3. Review email configuration in ARCHITECTURE.md

### GraphQL Query Error?
1. Check query syntax in Apollo Sandbox
2. Verify required fields are included
3. Review expected input in documentation
4. Check authentication header if needed

---

## 📖 Reading Order

**For Different Roles**

### Junior Developer
1. README.md
2. ARCHITECTURE.md (overview section)
3. GRAPHQL_QUICK_REFERENCE.md
4. Test in Apollo Sandbox

### Senior Developer  
1. ARCHITECTURE.md (all sections)
2. MIGRATION_GUIDE.md
3. Code review similar models
4. Implement following established patterns

### Product Manager
1. README.md
2. GRAPHQL_API_DOCUMENTATION.md (features overview)
3. GRAPHQL_QUICK_REFERENCE.md (workflows)
4. Demo in Apollo Sandbox

### DevOps
1. README.md (setup section)
2. ARCHITECTURE.md (deployment checklist)
3. Configure .env variables
4. Verify all systems connected

---

## 🚀 Next Steps

### Immediate (This Week)
- [ ] Review ARCHITECTURE.md
- [ ] Test queries in Apollo Sandbox
- [ ] Understand user authentication flow
- [ ] Review code in src/modules/users/

### Short Term (This Month)
- [ ] Migrate Order model to Firestore
- [ ] Migrate Subscription model
- [ ] Add comprehensive error handling
- [ ] Set up monitoring

### Medium Term (This Quarter)
- [ ] Migrate all 22 remaining models
- [ ] Add real-time Firestore listeners
- [ ] Implement data analytics
- [ ] Performance optimization

### Long Term (This Year)
- [ ] Add advanced search capabilities
- [ ] Implement caching strategies
- [ ] Set up disaster recovery
- [ ] Scale to global infrastructure

---

## 📞 Quick Help

### "Where is X feature?"
→ Check GRAPHQL_ENDPOINTS_REFERENCE.md

### "How does Y work?"
→ Read ARCHITECTURE.md corresponding section

### "How to test Z?"
→ Find in GRAPHQL_TESTING_GUIDE.md

### "How do I migrate model W?"
→ Follow pattern in MIGRATION_GUIDE.md

---

**Last Updated**: February 14, 2026  
**Server Status**: ✅ Running on Port 5000  
**API Endpoint**: http://localhost:5000/graphql

**Happy Coding! 🎉**
