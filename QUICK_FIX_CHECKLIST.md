# ⚡ Quick Fix Checklist - Do This Now

## Before You Deploy Again

### Step 1: Verify Setup (2 minutes)
```bash
cd server
npm run verify
```
- ✅ All checks pass? Continue to Step 2
- ❌ Errors shown? Fix the missing variables first

### Step 2: Generate JWT Secrets (1 minute)
Run this in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output. Run it again for second secret.

### Step 3: Prepare Firebase Credentials (2 minutes)

**You have the JSON file locally?**
```bash
# Find this file in your server directory:
# vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json

# Open with text editor
# Copy ENTIRE content (it's one long JSON object)
```

**Don't have the file?**
```
1. Go to: https://console.firebase.google.com/
2. Click your project name
3. Click ⚙️ Settings (gear icon, top right)
4. Click "Service Accounts" tab
5. Click "Generate New Private Key"
6. Save the JSON file
7. Copy the content
```

### Step 4: Add to Vercel Dashboard (3 minutes)

**Go to:** https://vercel.com → Your Project → Settings → Environment Variables

**Add each variable:**

```
Name: NODE_ENV
Value: production

Name: FIREBASE_SERVICE_ACCOUNT  
Value: [PASTE YOUR ENTIRE FIREBASE JSON HERE]

Name: REDIS_URL
Value: redis://:[PASSWORD]@[HOST]:[PORT]
Example: redis://:mypass@upstash.io:6379

Name: JWT_SECRET
Value: [PASTE FIRST SECRET YOU GENERATED]

Name: JWT_REFRESH_SECRET
Value: [PASTE SECOND SECRET YOU GENERATED]

Name: MAILING_EMAIL
Value: your-email@gmail.com

Name: MAILING_PASSWORD
Value: [YOUR GMAIL APP PASSWORD]

Name: PAYSTACK_SECRET_KEY
Value: [YOUR PAYSTACK SECRET]

Name: PAYMENT_WEBHOOK_SECRET
Value: [YOUR WEBHOOK SECRET]
```

**Gmail App Password?**
1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" and "Windows Computer"
3. Google generates a 16-character password
4. Use that as MAILING_PASSWORD

### Step 5: Commit Code (1 minute)
```bash
cd server
git add -A
git commit -m "Fix Vercel deployment - serverless configuration updated"
git push origin master
```

### Step 6: Let Vercel Deploy (2-5 minutes)
1. Go to Vercel Dashboard
2. Click "Deployments" tab
3. You should see a new deployment starting
4. Wait for it to complete

### Step 7: Verify It Works (2 minutes)

**Test 1: Health Check**
```bash
curl https://your-vercel-app-name.vercel.app/health
```
Expected response:
```json
{"status":"ok"}
```

**Test 2: GraphQL**
```bash
curl -X POST https://your-vercel-app-name.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```
Expected response:
```json
{"data":{"__typename":"Query"}}
```

**Test 3: API Request**
```bash
curl -X POST https://your-vercel-app-name.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { requestActivationCode(email: \"test@example.com\", fullName: \"Test\", phone: \"+234801234567\") { success message } }"
  }'
```

---

## ✅ Deployment Success Checklist

Before considering deployment successful:

- [ ] `npm run verify` shows all checks passed
- [ ] All environment variables set in Vercel dashboard
- [ ] Firebase credentials valid JSON
- [ ] Redis URL properly formatted
- [ ] JWT secrets are strong (32+ characters)
- [ ] Code committed and pushed to Git
- [ ] Vercel deployment completed (check status)
- [ ] Health endpoint responds with 200 OK
- [ ] GraphQL introspection works (returns `__typename`)
- [ ] Test API request works

---

## 🆘 If Something Still Fails

### Check These First
1. **Vercel Logs**: Dashboard → Deployments → [Latest] → Logs
2. **Verification**: `npm run verify` locally
3. **Firebase JSON**: Is it valid? Test at https://jsonlint.com/
4. **REDIS_URL**: Correct format? Should be `redis://:password@host:port`
5. **Environment**: All variables set in Vercel? (not just locally)

### Common Issues

**"Firebase service account not valid"**
- Is the entire JSON copied correctly?
- Does it have `type`, `project_id`, `private_key`?
- Check JSONLint.com for validity

**"Redis connection timeout"**
- Redis is optional, app should still work
- If needed, verify Redis URL is correct
- Check if Redis service is running

**"CORS error"**
- Make sure `CORS_ORIGIN` includes your frontend domain
- Example: `https://frontend.com,http://localhost:3000`

**"Cannot find module"**
- Run locally: `npm install`
- Commit changes: `git add package-lock.json && git commit`
- Push again: `git push`

---

## 📋 Quick Reference

| What | Where |
|------|-------|
| Vercel Dashboard | https://vercel.com |
| Firebase Console | https://console.firebase.google.com |
| API Health Check | `https://your-app.vercel.app/health` |
| GraphQL Endpoint | `https://your-app.vercel.app/graphql` |
| Env Variables | Dashboard → Settings → Environment Variables |
| Deployment Logs | Dashboard → Deployments → [Latest] → Logs |

---

## ⏱️ Time Required

| Step | Time |
|------|------|
| Verify setup | 2 min |
| Generate secrets | 1 min |
| Get Firebase creds | 2 min |
| Add to Vercel | 3 min |
| Commit code | 1 min |
| Deploy | 2-5 min |
| Verify working | 2 min |
| **Total** | **13-16 min** |

---

## Need Help?

1. **Setup questions?** Check `VERCEL_DEPLOYMENT_FIXES.md`
2. **Environment variables?** Check `VERCEL_DEPLOYMENT_GUIDE.md`
3. **Still failing?** Check Vercel logs for specific error
4. **Quick test?** Run `npm run verify`

---

**Go ahead and follow these steps!** 🚀

You should be deployed within 15 minutes.
