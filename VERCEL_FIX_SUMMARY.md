# Vercel Deployment - Critical Fixes Applied ✅

## What Was Wrong

Your Vercel deployment was failing with `500 INTERNAL_SERVER_ERROR` due to **4 critical issues**:

### 1. ❌ **Wrong Entry Point in vercel.json**
- **Problem**: Pointing to `src/server.js` which tries to call `httpServer.listen()`
- **Why it failed**: Vercel serverless functions can't bind to ports. They receive HTTP requests directly.
- **Fix**: Changed to `api/index.js` which properly exports the Express app

### 2. ❌ **Firebase Credentials Handling**
- **Problem**: Code hard-coded to read Firebase JSON from file path (doesn't exist on Vercel)
- **Why it failed**: File path doesn't exist in Vercel's serverless environment
- **Fix**: Updated to fall back to `FIREBASE_SERVICE_ACCOUNT` environment variable

### 3. ❌ **Missing Environment Variables**
- **Problem**: Critical env vars not configured in Vercel dashboard
- **Why it failed**: Service initialization fails immediately without required secrets
- **Fix**: Created complete guide for setting up 9 environment variables

### 4. ❌ **Mixed Module Systems**
- **Problem**: ES modules (import) mixed with CommonJS (require)
- **Why it failed**: Inconsistent module handling causes runtime errors
- **Fix**: Standardized to ES modules throughout

---

## Files Modified

### 1. **vercel.json** ✅
```json
{
  "builds": [{ "src": "api/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.js" }]
}
```

### 2. **api/index.js** ✅
- Added proper initialization middleware
- Added comprehensive error handling with detailed logging
- Made Redis optional (doesn't crash if unavailable)
- Made Firebase errors clear and actionable

### 3. **src/config/index.js** ✅
- Fixed dotenv loading to not double-load in production

### 4. **src/infrastructure/database/firebase.js** ✅
- Firebase now falls back to `FIREBASE_SERVICE_ACCOUNT` env var
- Tries file first (for local dev), then env var (for Vercel)
- Better error messages for debugging

### 5. **package.json** ✅
- Added `npm run verify` script to check deployment readiness

---

## What You Need to Do Now

### ✅ Step 1: Verify Your Setup Locally
```bash
cd server
npm run verify
```

This will check:
- Node version compatibility
- All required files present
- Environment variables configured
- Firebase credentials validity
- Redis connection string format

### ✅ Step 2: Set Up Environment Variables in Vercel

**Go to Vercel Dashboard:**
1. Select your project
2. Click "Settings" → "Environment Variables"
3. Add these variables:

| Variable | Value | Example |
|----------|-------|---------|
| `NODE_ENV` | `production` | production |
| `FIREBASE_SERVICE_ACCOUNT` | Your Firebase JSON | `{"type":"service_account",...}` |
| `REDIS_URL` | Redis connection URL | `redis://:password@host:6379` |
| `JWT_SECRET` | Random 32+ chars | `npm run gen-secret` |
| `JWT_REFRESH_SECRET` | Random 32+ chars | `npm run gen-secret` |
| `MAILING_EMAIL` | Your email | `admin@vicelle.com` |
| `MAILING_PASSWORD` | App password | (Gmail app password) |
| `PAYSTACK_SECRET_KEY` | Paystack key | `sk_live_...` |
| `PAYMENT_WEBHOOK_SECRET` | Webhook secret | `whpsec_...` |

### ✅ Step 3: Generate JWT Secrets
```bash
# Run this in Node to generate strong secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run twice (one for JWT_SECRET, one for JWT_REFRESH_SECRET)

### ✅ Step 4: Prepare Firebase Service Account

**Option A: If you have the JSON file**
```bash
# Find: vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json
# Open with text editor
# Copy entire content
# Paste as FIREBASE_SERVICE_ACCOUNT in Vercel
```

**Option B: Get new credentials from Firebase**
1. Go to Firebase Console → Your Project
2. Click ⚙️ Settings (top)
3. Go to "Service Accounts" tab
4. Click "Generate New Private Key"
5. Copy the JSON content
6. Paste as FIREBASE_SERVICE_ACCOUNT in Vercel

### ✅ Step 5: Commit and Deploy
```bash
# Commit the fixes
git add -A
git commit -m "Fix Vercel deployment - critical fixes applied"

# Push to trigger Vercel deployment
git push origin master
```

### ✅ Step 6: Monitor Deployment
1. Go to Vercel Dashboard
2. Watch the "Deployments" section
3. Check "Build Logs" if it fails
4. Once deployed, test:

```bash
# Test health endpoint
curl https://your-vercel-app.vercel.app/health

# Test GraphQL
curl -X POST https://your-vercel-app.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

---

## Complete Environment Variables Setup

### Critical Variables (Must Have)
1. **NODE_ENV** = `production`
2. **FIREBASE_SERVICE_ACCOUNT** = Your Firebase service account JSON
3. **JWT_SECRET** = Strong random 32+ character string

### Recommended Variables
4. **REDIS_URL** = Your Redis connection string
5. **MAILING_EMAIL** = Email for send notifications
6. **MAILING_PASSWORD** = Email app password

### Payment Variables (If using Paystack)
7. **PAYSTACK_SECRET_KEY** = Your Paystack secret key
8. **PAYMENT_WEBHOOK_SECRET** = Your webhook secret

### Optional Variables
9. **CORS_ORIGIN** = Your frontend domain (e.g., `https://vicelle.app`)

---

## Testing Your Deployment

### Health Check
```bash
curl https://your-app.vercel.app/health
# Expected: 200 OK with status: "ok"
```

### GraphQL Introspection
```bash
curl -X POST https://your-app.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
# Expected: 200 OK with data: { __typename: "Query" }
```

### Test Authentication
```bash
curl -X POST https://your-app.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { 
      requestActivationCode(
        email: \"test@example.com\"
        fullName: \"Test\"
        phone: \"+234801234567\"
      ) { success message }
    }"
  }'
```

---

## If Deployment Still Fails

### Check Logs
```
Vercel Dashboard → Deployments → [Your Deployment] → Logs
Look for lines starting with: ❌ or ERRO
```

### Common Issues & Solutions

| Error | Solution |
|-------|----------|
| "Cannot find module" | Run `npm install` and commit `package-lock.json` |
| "Firebase service account not found" | Set `FIREBASE_SERVICE_ACCOUNT` env var in Vercel |
| "CORS error" | Make sure `CORS_ORIGIN` includes your frontend domain |
| "Redis connection timeout" | Redis is optional, or verify `REDIS_URL` is correct |
| "Cannot parse FIREBASE_SERVICE_ACCOUNT" | Ensure JSON is valid - test at JSONLint.com |

---

## Quick Reference

### Critical Files Changed
- ✅ `vercel.json` - Fixed entry point
- ✅ `api/index.js` - Fixed serverless function
- ✅ `src/config/index.js` - Fixed env loading
- ✅ `src/infrastructure/database/firebase.js` - Fixed Firebase init

### New Files Added
- ✅ `VERCEL_DEPLOYMENT_FIXES.md` - Detailed guide
- ✅ `verify-deployment.js` - Verification script

### Deployment Progress
1. ✅ Code fixes applied
2. ⏳ Set environment variables in Vercel
3. ⏳ Commit and push
4. ⏳ Monitor deployment
5. ⏳ Test endpoints

---

## Next Steps

1. **Verify locally**: `npm run verify`
2. **Set env vars**: Go to Vercel dashboard
3. **Commit changes**: `git add -A && git commit -m "Fix Vercel deployment"`
4. **Push**: `git push origin master`
5. **Monitor**: Check Vercel logs
6. **Test**: Call your API endpoints

---

## Support

If you're still having issues:

1. **Check verification script output**: `npm run verify`
2. **Review Vercel logs**: Dashboard → Deployments → [Your Deployment]
3. **Test Firebase locally**: Try connecting with the same credentials
4. **Verify Redis**: Check Redis URL is correct
5. **Check CORS**: Make sure your frontend domain is in `CORS_ORIGIN`

---

**Status**: ✅ Ready for Deployment  
**Last Updated**: February 16, 2026  
**Quick Start**: `npm run verify` → Fix issues → `git push` → Deploy
