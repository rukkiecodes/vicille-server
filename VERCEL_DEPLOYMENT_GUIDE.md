# Vercel Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Vicelle backend to Vercel.

### Important Considerations

⚠️ **Note:** This is a complex backend application with:
- **Redis** for caching (requires external Redis service)
- **Firebase/Firestore** for database (requires Firebase project)
- **GraphQL** subscriptions (requires special handling on Vercel)
- **Socket.io** for real-time features (has limitations on Vercel free tier)

**Recommendation:** For production, consider Vercel Pro or alternative platforms like:
- Railway.app
- Render.com
- AWS EC2
- DigitalOcean

However, Vercel can work with careful configuration.

---

## Pre-Deployment Checklist

### 1. **Prepare Your Environment Variables**

All environment variables must be set in Vercel. Use `.env.example` as a reference.

**Critical variables for Vercel:**
```
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<strong-random-secret>
REDIS_URL=<redis-cloud-url>
```

### 2. **Set Up External Services**

#### Redis
- Use a hosted Redis service: [Redis Cloud](https://redis.com/try-free/), [Upstash](https://upstash.com/)
- Get the connection URL: `redis://user:password@host:port`
- Test the connection before deploying

#### Firebase
- Create a Firebase project if you haven't already
- Download the service account JSON from Firebase Console
- Store the JSON securely in environment variables

#### Email Service
- Set up SMTP credentials (Gmail, SendGrid, etc.)
- Test email sending locally first

#### Cloudinary
- Create an account and get API credentials
- Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

#### Payment Gateway (Paystack)
- Get API keys from Paystack dashboard
- Set webhook secret for payment notifications

---

## Deployment Steps

### Step 1: Push to GitHub

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Prepare for Vercel deployment"
git remote add origin https://github.com/your-username/vicelle-server.git
git push -u origin main
```

### Step 2: Connect to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. Select root directory: `/` (or `./`)
5. Framework Preset: **Other** (since it's a custom Node.js app)

### Step 3: Configure Environment Variables

In Vercel Dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add all variables from `.env.example`:
   ```
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   JWT_SECRET=<your-value>
   JWT_REFRESH_SECRET=<your-value>
   REDIS_URL=<your-redis-url>
   MAILING_EMAIL=<your-email>
   MAILING_PASSWORD=<your-password>
   ... (all other variables)
   ```

3. For Firebase service account:
   - **Option A:** Upload the JSON file as a secret in Vercel
   - **Option B:** Convert to string and set as environment variable
   
   ```bash
   # Base64 encode the JSON
   cat vicelle-fashion-firebase-adminsdk-fbsvc-af0ced6697.json | base64
   
   # Set as FIREBASE_SERVICE_ACCOUNT in Vercel
   # Then decode in your code
   ```

### Step 4: Configure Build Settings

In Vercel Dashboard:

1. **Build Command:** `npm install` (if needed, or leave empty for default)
2. **Output Directory:** Leave empty (root)
3. **Install Command:** `npm install`
4. **Development Command:** `npm run dev`

### Step 5: Deploy

1. Click **"Deploy"**
2. Monitor the deployment in Vercel Dashboard
3. Check logs if there are errors

---

## Post-Deployment Verification

### 1. Check Health Endpoint

```bash
curl https://your-deployed-app.vercel.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-16T10:30:00Z",
  "environment": "production"
}
```

### 2. Test GraphQL Endpoint

```bash
curl -X POST https://your-deployed-app.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### 3. Check Logs

```bash
# View real-time logs in Vercel Dashboard
# Settings → Logs
```

---

## Troubleshooting

### Issue: "Module not found" errors

**Solution:**
```bash
# Ensure all dependencies are in package.json
npm install --save package-name

# Verify node_modules is in .gitignore
cat .gitignore | grep node_modules
```

### Issue: Redis connection timeout

**Solution:**
- Verify Redis URL format: `redis://user:password@host:port/db`
- Check if Redis service is running
- Add whitelisting in Redis Cloud if needed
- Check Vercel's IP allowlist if using IP-restricted Redis

### Issue: Firebase authentication fails

**Solution:**
- Verify service account JSON is correctly set
- Check file path is correct relative to project root
- Ensure all required Firebase APIs are enabled

### Issue: "PORT" is not available

**Solution:**
- Vercel automatically assigns a PORT
- Code already reads from environment: `PORT=process.env.PORT || 4000`
- No changes needed

### Issue: Timeouts on Cold Start

**Solution:**
- Reduce initialization work
- Move non-critical operations to lazy initialization
- Consider upgrading to Vercel Pro for better performance

---

## Configuration Files Provided

### vercel.json
- Specifies Node.js runtime and memory allocation
- Configures routes and security headers
- Sets environment variables

### .vercelignore
- Excludes unnecessary files from deployment
- Reduces deployment size
- Improves deployment speed

### api/index.js
- Serverless entry point for Vercel
- Handles service initialization
- Alternative to traditional server for some scenarios

---

## Important Notes

### Socket.io Limitations

Socket.io with subscriptions has limitations on Vercel:
- Works better with Vercel Pro (for persistent connections)
- Free tier may have connection drops
- Consider using separate service for WebSockets:
  - AWS AppSync
  - Pusher
  - Ably

### Redis Limitations

- Must use external hosted Redis (Upstash, Redis Cloud)
- Local Redis won't work in serverless environment
- Ensure Redis service is highly available

### Recommended Upgrade Path

```
Development → Staging → Production
     ↓            ↓           ↓
   Localhost   Vercel       Vercel Pro
                            or Railway/Render
```

---

## Emergency Rollback

If something goes wrong:

1. Go to Vercel Dashboard
2. Select your project
3. Go to **"Deployments"**
4. Find last stable deployment
5. Click "Promote to Production"

Or:

```bash
vercel rollback
```

---

## Monitoring & Maintenance

### Set Up Monitoring

1. **Vercel Analytics:**
   - Enable in Vercel Dashboard
   - Monitor performance and errors

2. **Third-party Services:**
   - Add Sentry for error tracking
   - Add DataDog or New Relic for APM

3. **Email Alerts:**
   - Configure Vercel notifications for deployment issues
   - Set up alerts for high error rates

### Regular Tasks

- Monitor Redis usage
- Check Firebase quota
- Review API rate limits
- Analyze logs weekly
- Update dependencies monthly

---

## Quick Command Reference

```bash
# Deploy using Vercel CLI
npm i -g vercel
vercel deploy --prod

# Check deployment status
vercel ls

# View logs
vercel logs <deployment-url>

# Set environment variable
vercel env add VARIABLE_NAME

# Remove deployment
vercel remove <deployment-name>
```

---

## Support & Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Node.js on Vercel](https://vercel.com/docs/runtimes/nodejs)
- [Redis Cloud Docs](https://docs.rediscloud.com/)
- [Firebase Documentation](https://firebase.google.com/docs)

---

**Last Updated:** February 16, 2026
