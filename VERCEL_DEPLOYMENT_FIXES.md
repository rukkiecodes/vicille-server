# Vercel Deployment - Fixes & Setup Guide

## 🔧 Fixed Issues

### Issue 1: Incorrect Entry Point
**Problem**: `vercel.json` was pointing to `src/server.js` which tries to listen on a port (doesn't work on Vercel)  
**Fix**: Changed entry point to `api/index.js` which properly exports the app

### Issue 2: Firebase Service Account Path
**Problem**: Code was hard-coded to read Firebase credentials from a JSON file that doesn't exist on Vercel  
**Fix**: Updated to fall back to `FIREBASE_SERVICE_ACCOUNT` environment variable

### Issue 3: Missing Environment Variables in Vercel
**Problem**: Environment variables weren't configured in Vercel dashboard  
**Fix**: See setup instructions below

### Issue 4: Import/Require Mixing
**Problem**: ES modules mixed with CommonJS require()  
**Fix**: Consistent use of ES module imports

---

## 📋 Vercel Environment Variables Setup

Go to your Vercel project dashboard and add these environment variables:

### 1. **Node Environment**
```
NODE_ENV = production
```

### 2. **Firebase Credentials** (CRITICAL)
You need to set `FIREBASE_SERVICE_ACCOUNT` as a JSON string.

**To get your Firebase service account JSON:**

Option A: Use the existing file (if you have it):
```
1. Find: vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json
2. Open it with a text editor
3. Copy the entire content
```

Option B: Create new credentials:
```
1. Go to Firebase Console → Project Settings
2. Click "Service Accounts" tab
3. Click "Generate New Private Key"
4. Copy the JSON content
```

**Add to Vercel:**
```
Variable Name: FIREBASE_SERVICE_ACCOUNT
Value: (Paste the entire JSON content as a single line or multi-line)
```

⚠️ **Important**: Make sure the entire JSON is valid when pasted

### 3. **Redis URL**
```
REDIS_URL = redis://:[PASSWORD]@[HOST]:[PORT]
```

Example (if using Upstash Redis):
```
REDIS_URL = redis://:your_password@your_host.upstash.io:6379
```

### 4. **JWT Secrets**
```
JWT_SECRET = your-secret-key-min-32-chars-long
JWT_REFRESH_SECRET = your-refresh-secret-min-32-chars-long
```

For production, use strong random strings:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. **Email Configuration (SMTP)**
```
MAILING_EMAIL = your-email@gmail.com
MAILING_PASSWORD = your-app-password
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
```

⚠️ **Gmail users**: Use [App Password](https://myaccount.google.com/apppasswords), not your regular password

### 6. **Paystack Configuration**
```
PAYSTACK_SECRET_KEY = your-paystack-secret-key
PAYSTACK_PUBLIC_KEY = your-paystack-public-key
PAYMENT_WEBHOOK_SECRET = your-webhook-secret
```

### 7. **Cloudinary Configuration** (Optional, for image uploads)
```
CLOUDINARY_CLOUD_NAME = your-cloud-name
CLOUDINARY_API_KEY = your-api-key
CLOUDINARY_API_SECRET = your-api-secret
```

### 8. **CORS Configuration**
```
CORS_ORIGIN = https://your-frontend-domain.com,http://localhost:3000
```

### 9. **Other Configuration**
```
API_VERSION = v1
LOG_LEVEL = info
```

---

## ✅ Step-by-Step Vercel Setup

### Step 1: Connect Repository
```
1. Go to https://vercel.com
2. Click "New Project"
3. Select your GitHub repository
4. Click "Import"
```

### Step 2: Configure Project Settings
```
Build Command: npm run build
Output Directory: ./dist (or leave default)
Install Command: npm install
```

### Step 3: Add Environment Variables
```
1. In Vercel dashboard, click "Environment Variables"
2. Add all variables from section above
3. For sensitive data like FIREBASE_SERVICE_ACCOUNT:
   - Paste the exact JSON (keep it as one long line if single-line)
   - Or paste with proper formatting (Vercel handles both)
```

### Step 4: Deploy
```
1. Click "Deploy"
2. Wait for build and deployment to complete
3. Check the logs if it fails
```

---

## 🔍 Testing Your Deployment

### Test Health Endpoint
```bash
curl https://your-vercel-app.vercel.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-16T10:30:00Z",
  "environment": "production"
}
```

### Test GraphQL Endpoint
```bash
curl -X POST https://your-vercel-app.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

Expected response:
```json
{
  "data": {
    "__typename": "Query"
  }
}
```

### Test Authentication
```bash
curl -X POST https://your-vercel-app.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { requestActivationCode(email: \"test@example.com\", fullName: \"Test User\", phone: \"+234801234567\") { success message } }"
  }'
```

---

## 🆘 Troubleshooting

### Error: "FIREBASE_SERVICE_ACCOUNT is not valid JSON"
**Solution**: 
- Make sure JSON is properly formatted
- Remove any extra quotes wrapping the JSON
- Test JSON validity at JSONLint.com

### Error: "Redis connection timeout"
**Solution**:
- Verify REDIS_URL is correct
- Check Redis service is running (if self-hosted)
- If using Upstash, check credentials
- Redis can be optional - app should still work with reduced functionality

### Error: "Cannot find module"
**Solution**:
```bash
# Make sure deps are installed locally first
npm install

# Then commit package-lock.json
git add package-lock.json
git commit -m "Update dependencies"
git push
```

### Error: "CORS errors in browser"
**Solution**:
- Update CORS_ORIGIN to match your frontend domain
- Redeploy after changing env vars

### Deployment still fails?
**Check logs**:
```
1. Go to Vercel dashboard
2. Click your project
3. Click "Deployments"
4. Click the failed deployment
5. Check "Build Logs" and "Runtime Logs"
```

---

## 📊 Deployment Checklist

Before deploying to Vercel:

- [ ] All environment variables configured in Vercel dashboard
- [ ] Firebase service account JSON properly set
- [ ] Redis URL configured (or optional flag set)
- [ ] JWT secrets configured (strong random values)
- [ ] Email credentials configured (if using email features)
- [ ] Paystack keys configured (if using payments)
- [ ] CORS_ORIGIN updated to your frontend domain
- [ ] vercel.json correctly configured (`api/index.js` entry point)
- [ ] All files committed to Git
- [ ] Linked Git repository to Vercel project
- [ ] Deployment completed without errors
- [ ] Health endpoint responds correctly
- [ ] GraphQL endpoint responds correctly

---

## 🚀 Vercel Secrets (Sensitive Data)

For sensitive data like Firebase keys:

**Option 1: Using Vercel's Secrets** (Recommended)
```bash
# Using Vercel CLI
vercel env add FIREBASE_SERVICE_ACCOUNT
# Then paste your JSON
```

**Option 2: Via Dashboard**
```
1. Go to Settings → Environment Variables
2. Set scope to "Production"
3. Add sensitive variables
```

---

## 📝 Firebase Service Account JSON Structure

Your Firebase service account JSON should look like:
```json
{
  "type": "service_account",
  "project_id": "vicelle-fashion-...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-...",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "...",
  "auth_provider_x509_cert_url": "...",
  "client_x509_cert_url": "..."
}
```

---

## 📞 Support

If deployment still fails:

1. **Check Vercel logs** - Most helpful info is there
2. **Try local build**: `npm run build && npm start`
3. **Verify env vars** are exactly correct
4. **Test Firebase** locally with the same credentials
5. **Check Node version** - Vercel uses Node 18+ by default

---

**Last Updated**: February 2026  
**Status**: ✅ Ready for Deployment
