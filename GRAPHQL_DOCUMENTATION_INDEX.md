# 📚 Vicelle GraphQL Documentation Index

Welcome to the complete GraphQL API documentation for Vicelle! This guide will help you find exactly what you need.

---

## 📖 Documentation Files

### 1. **GRAPHQL_QUICK_REFERENCE.md** ⭐ START HERE
**Best for:** Getting started quickly with step-by-step examples

Contains:
- Complete user workflow (registration → order → payment)
- Complete tailor workflow
- Token management
- Error handling basics
- Copy-paste ready queries

**Read this if:**
- You're new to the API
- You want to understand the complete flow
- You need step-by-step examples

---

### 2. **GRAPHQL_TESTING_GUIDE.md** 🧪 TRY THESE EXAMPLES
**Best for:** Testing specific scenarios and workflows

Contains:
- Real-world testing scenarios
- Expected responses for each query
- Error examples and solutions
- Tailor workflow examples
- Payment processing examples
- Testing checklist
- Tips & tricks for GraphQL

**Read this if:**
- You want to test queries in Apollo Sandbox
- You want to see example responses
- You're learning how the API works
- You need to verify your implementation

---

### 3. **GRAPHQL_ENDPOINTS_REFERENCE.md** 📋 COMPLETE REFERENCE
**Best for:** Finding all available endpoints and their parameters

Contains:
- Complete list of all queries and mutations by module
- Input/output types for each endpoint
- Filter examples
- Pagination standards
- Common input types
- Common response examples
- Authorization format
- HTTP status codes

**Read this if:**
- You need to find a specific endpoint
- You want to see all available filters
- You need to understand input/output structures
- You're looking for response formats

---

### 4. **GRAPHQL_API_DOCUMENTATION.md** 📖 DETAILED DOCUMENTATION
**Best for:** Deep understanding of each feature

Contains:
- Detailed authentication flow diagrams
- Complete module-by-module documentation
- Complex examples
- Error handling guide
- Workflow examples
- Best practices

**Read this if:**
- You need detailed explanations
- You want to understand complex features
- You need architectural overview
- You're implementing advanced features

---

## 🎯 Quick Navigation

### I want to...

#### **Get Started (First Time)**
1. Read: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md)
2. Follow: Complete user workflow section
3. Test: Use Apollo Sandbox to try examples

#### **Understand Complete Flows**
1. Read: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - User workflow
2. Read: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Order workflow
3. Read: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Payment workflow

#### **Test Specific Scenarios**
1. Go to: [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md)
2. Find your scenario (e.g., "New User Registration")
3. Copy query examples
4. Test in Apollo Sandbox
5. Check expected responses

#### **Find a Specific Endpoint**
1. Go to: [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md)
2. Find the module (Authentication, User, Order, etc.)
3. Look for the query/mutation you need
4. Check parameters and return types
5. See examples in [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md)

#### **Understand Authentication**
1. Read: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Step 1-3
2. Read: [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Authentication Flow

#### **Implement Orders**
1. Read: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Order workflow
2. Test: [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Scenario 2
3. Reference: [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - Order Module

#### **Handle Errors**
1. Quick: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Error Handling
2. Examples: [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Scenario 5
3. Detailed: [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Error Handling

---

## 🔍 Feature-Based Guide

### Infrastructure Setup
- **Database**: Firebase Firestore (primary storage)
- **Cache**: Redis (authenticated user sessions - 7-day TTL)
- **Files**: Cloudinary (all images and documents)
- **Email**: NodeMailer (SMTP via Gmail)
- **Port**: 5000

### Architecture Overview

### Authentication
- **Quick Start:** [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Steps 1-3
- **Testing:** [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Scenario 1
- **All Endpoints:** [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - Auth Module
- **Detailed:** [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Authentication Flow

### User Profile
- **Quick Start:** [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Steps 4-7
- **Testing:** [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Scenario 1
- **All Endpoints:** [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - User Module
- **Detailed:** [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - User Module

### Orders
- **Quick Start:** [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Order Workflow
- **Testing:** [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Scenario 2
- **All Endpoints:** [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - Order Module
- **Detailed:** [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Order Module

### Payments
- **Quick Start:** [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Payment Workflow
- **Testing:** [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Scenario 3
- **All Endpoints:** [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - Payment Module
- **Detailed:** [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Payment Module

### Subscriptions
- **Quick Start:** [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Order Workflow/Step 1-2
- **All Endpoints:** [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - Subscription Module
- **Detailed:** [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Subscription Module

### Tailors
- **Quick Start:** [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Tailor Workflow
- **Testing:** [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Scenario 4
- **All Endpoints:** [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - Tailor Module
- **Detailed:** [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Tailor Module

### Measurements
- **Quick Start:** [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Order Workflow/Step 3
- **All Endpoints:** [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) - Measurement Module
- **Detailed:** [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md) - Measurement Module

---

## 📋 Document Comparison

| Document | Best For | Length | Detail Level |
|----------|----------|--------|---|
| **QUICK_REFERENCE** | Learning & quick lookup | 🟢 Medium | 🟡 Medium |
| **TESTING_GUIDE** | Testing & examples | 🟢 Medium | 🟡 Medium |
| **ENDPOINTS_REFERENCE** | Complete endpoint catalog | 🟠 Long | 🟢 High |
| **API_DOCUMENTATION** | Detailed understanding | 🟠 Very Long | 🟢 Very High |

---

## 🚀 Quick Start (5 Minutes)

1. **Open Apollo Sandbox:** `http://localhost:4000/graphql`

2. **Request Activation Code:**
```graphql
mutation {
  requestActivationCode(
    email: "test@example.com"
    fullName: "Test User"
    phone: "+234801234567"
  ) {
    success
  }
}
```

3. **Check console for activation code** (development only)

4. **Verify Code & Get Token:**
```graphql
mutation {
  verifyActivationCode(
    email: "test@example.com"
    code: "YOUR_CODE_HERE"
  ) {
    accessToken
    user { id email }
  }
}
```

5. **Set Authorization Header:**
   - Click "Headers" tab
   - Add: `"Authorization": "Bearer YOUR_TOKEN"`

6. **Get Your Profile:**
```graphql
query {
  me { id email fullName }
}
```

✅ **Done! You're authenticated.**

---

## 🎓 Learning Path

### Beginner (1-2 hours)
1. Read: GRAPHQL_QUICK_REFERENCE.md (first 3 steps)
2. Test: Complete user registration in Apollo Sandbox
3. Read: GRAPHQL_QUICK_REFERENCE.md (steps 4-7)
4. Test: Update profile in Apollo Sandbox

### Intermediate (2-4 hours)
1. Test: All scenarios in GRAPHQL_TESTING_GUIDE.md
2. Read: Complete GRAPHQL_QUICK_REFERENCE.md
3. Understand: GRAPHQL_ENDPOINTS_REFERENCE.md modules

### Advanced (4+ hours)
1. Study: GRAPHQL_API_DOCUMENTATION.md
2. Reference: GRAPHQL_ENDPOINTS_REFERENCE.md for all details
3. Implement: Your own frontend integration

---

## 🆘 Troubleshooting

### "Unauthorized" Error
- Read: [GRAPHQL_QUICK_REFERENCE.md](GRAPHQL_QUICK_REFERENCE.md) - Step 3
- Check: Authorization header is set correctly
- Test: Copy exact token from response

### "Query not found" Error
- Check: [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md) for available queries
- Spell: Verify query name spelling
- Args: Check required arguments

### Unexpected Response
- Read: [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md) - Expected responses
- Compare: Your query vs example
- Validate: Input parameters

### Implementation Questions
- Reference: [GRAPHQL_API_DOCUMENTATION.md](GRAPHQL_API_DOCUMENTATION.md)
- Examples: [GRAPHQL_TESTING_GUIDE.md](GRAPHQL_TESTING_GUIDE.md)
- Details: [GRAPHQL_ENDPOINTS_REFERENCE.md](GRAPHQL_ENDPOINTS_REFERENCE.md)

---

## 📱 Access Apollo Sandbox

**URL:** `http://localhost:4000/graphql`

**Features:**
- 📖 Full schema documentation (click "Docs")
- 🏃 Quick queries (click "Playground")
- 📝 Operation history
- ⚙️ Settings for headers
- 🔍 Schema introspection

---

## 🔗 Document Links

- [Quick Reference Guide](GRAPHQL_QUICK_REFERENCE.md)
- [Testing & Examples](GRAPHQL_TESTING_GUIDE.md)
- [Complete Endpoints Reference](GRAPHQL_ENDPOINTS_REFERENCE.md)
- [Detailed API Documentation](GRAPHQL_API_DOCUMENTATION.md)

---

## 📊 Statistics

- **Total Queries:** 45+
- **Total Mutations:** 60+
- **Supported User Types:** 3 (User, Tailor, Admin)
- **Main Modules:** 8 (Auth, User, Order, Payment, Subscription, Tailor, Measurement, Admin)
- **Rate Limit:** 100 requests/minute
- **Token Expiry:** 7 days (access), 30 days (refresh)

---

## 🔄 Recommended Reading Order

**First Time Users:**
1. This index (you are here ✓)
2. GRAPHQL_QUICK_REFERENCE.md (complete user workflow)
3. GRAPHQL_TESTING_GUIDE.md (test scenarios 1-3)
4. Apollo Sandbox (try the queries yourself)

**When Building Features:**
1. Find feature in GRAPHQL_QUICK_REFERENCE.md
2. See examples in GRAPHQL_TESTING_GUIDE.md
3. Get all details from GRAPHQL_ENDPOINTS_REFERENCE.md
4. Deep dive if needed in GRAPHQL_API_DOCUMENTATION.md

**When Debugging:**
1. Check error in GRAPHQL_TESTING_GUIDE.md - Scenario 5
2. Verify endpoint in GRAPHQL_ENDPOINTS_REFERENCE.md
3. Review details in GRAPHQL_API_DOCUMENTATION.md
4. Test in Apollo Sandbox with correct parameters

---

## 💡 Pro Tips

1. **Read Documentation Offline** - Download all .md files
2. **Use Search** - CMD+F to find terms in docs
3. **Copy-Paste Examples** - All examples are ready to use
4. **Check Console** - Server logs show activation codes in dev
5. **Use Variables** - Makes GraphQL queries cleaner
6. **Save Tokens** - Keep access tokens during testing
7. **Check Headers** - Ensure Authorization header is set
8. **Introspection** - Use Apollo Sandbox "Docs" for schema

---

**Last Updated:** February 14, 2026  
**API Version:** 1.0  
**Status:** ✅ Complete

**Questions?** Check the relevant document or test in Apollo Sandbox!
