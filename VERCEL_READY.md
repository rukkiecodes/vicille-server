# Vicelle Backend - Vercel Deployment Ready ✅

Your backend is now prepared for deployment to Vercel. This document summarizes the changes made and next steps.

## 📋 What Was Done

### Files Created/Modified

| File | Purpose |
|------|---------|
| **vercel.json** | Vercel configuration with routing, security headers, and runtime settings |
| **.vercelignore** | Specifies files to exclude from Vercel deployment |
| **api/index.js** | Serverless entry point for Vercel (alternative deployment method) |
| **VERCEL_DEPLOYMENT_GUIDE.md** | Comprehensive deployment instructions |
| **VERCEL_DEPLOYMENT_CHECKLIST.md** | Pre-flight checklist for deployment |
| **package.json** | Updated with build scripts and Vercel-compatible Node version constraint |

### Key Configuration

✅ **vercel.json includes:**
- Node.js 20.x runtime
- Memory allocation: 1024MB per function
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- Route configuration
- Environment variable setup

✅ **.vercelignore configured to exclude:**
- node_modules/
- Tests and coverage files
- IDE and OS files
- Logs and temporary files
- Firebase service account files (for security)

✅ **package.json updated:**
- Added `build` and `vercel-build` scripts
- Node version constraint: `>=18.0.0 <21.0.0`
- All production dependencies included

## 🚀 Next Steps: Quick Start Deploy

### 1️⃣ Prepare Environment Variables

Gather all required environment variables and store them securely:

```bash
# Create a local backup (DO NOT commit this)
cp .env.example .env.production.local

# Edit with production values
nano .env.production.local
```

**Required variables** (see `.env.example` for complete list):
- `JWT_SECRET` - Strong random string (min 32 characters)
- `JWT_REFRESH_SECRET` - Strong random string
- `REDIS_URL` - From Redis Cloud or Upstash
- `MAILING_EMAIL` & `MAILING_PASSWORD` - SMTP credentials
- `CLOUDINARY_*` - Image upload service
- `PAYSTACK_*` - Payment processing
- And others from `.env.example`

### 2️⃣ Set Up External Services

Before deploying, ensure these are ready:

**Redis** (for caching):
- Option 1: [Upstash](https://upstash.com/) - free tier available
- Option 2: [Redis Cloud](https://redis.com/try-free/) - free tier available
- Get connection string format: `redis://user:password@host:port`

**Firebase** (database):
- Create project at [firebase.google.com](https://firebase.google.com)
- Enable Firestore
- Create service account in Project Settings
- Download JSON key file

**Email Service** (SMTP):
- Gmail: Enable 2FA and create [App Password](https://myaccount.google.com/apppasswords)
- Or use SendGrid, Mailgun, etc.

**Payment (Paystack)**:
- Create account at [paystack.com](https://paystack.com)
- Get test API keys
- Set webhook URL: `https://your-domain.vercel.app/webhooks/payment`

**Cloudinary** (image hosting):
- Sign up at [cloudinary.com](https://cloudinary.com)
- Get Cloud Name, API Key, API Secret

### 3️⃣ Deploy to Vercel

**Option A: Using Vercel CLI**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

**Option B: Using Vercel Dashboard**

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Add all environment variables
5. Click "Deploy"

### 4️⃣ Verify Deployment

After deployment completes:

```bash
# Test health endpoint
curl https://your-domain.vercel.app/health

# Test GraphQL endpoint
curl -X POST https://your-domain.vercel.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

Expected responses:
- Health: `{"status":"ok","timestamp":"...","environment":"production"}`
- GraphQL: Should return GraphQL schema info (no errors)

## 📖 Detailed Documentation

For more detailed information, refer to:

- **[VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)** - Step-by-step deployment guide with troubleshooting
- **[VERCEL_DEPLOYMENT_CHECKLIST.md](./VERCEL_DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
- **[.env.example](./.env.example)** - All environment variables reference

## ⚠️ Important Considerations

### Vercel Tier Limitations

| Feature | Free | Pro | Recommended |
|---------|------|-----|-------------|
| Cold Start | ~10-15s | ~5s | Pro+ |
| Always On | ❌ | ✅ | ✅ |
| WebSockets | Limited | Better | Pro |
| Memory | 512MB | 1GB | 1GB+ |
| Concurrent Requests | Handled | High | High |

### Socket.io Limitations

Socket.io (real-time features) has limitations on Vercel:
- Free tier: Only works with polling, not WebSockets
- Pro tier: Better support with connections
- Alternative: Use Pusher, Ably, or AWS AppSync

### Recommended For Production

For production deployment, consider:
- **[Railway.app](https://railway.app)** - Great for full-stack apps, good pricing
- **[Render.com](https://render.com)** - Similar to Heroku, reliable
- **AWS/GCP/Azure** - Most control and scale

These platforms handle persistent connections and background jobs better.

## 🔒 Security Checklist

Before going live:
- [ ] All secrets in Vercel environment (not in code)
- [ ] HTTPS enforced on Vercel
- [ ] API keys rotated
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] JWT expiration set appropriately
- [ ] Database backup configured
- [ ] Error logging configured

## 📊 Post-Deployment Monitoring

Set up monitoring:

```bash
# Vercel Analytics (built-in)
# - Go to Vercel Dashboard → Project Settings → Analytics

# Optional: Error Tracking
npm install @sentry/node
# Then configure in src/server.js

# Optional: Performance Monitoring
npm install datadog-browser-analytics
```

## 🆘 Troubleshooting

### Build Fails
1. Check `npm install` works locally
2. Verify all dependencies in package.json
3. Check `.vercelignore` isn't excluding needed files
4. View logs in Vercel Dashboard

### Connection Errors
1. Verify Redis URL format
2. Check Firebase credentials
3. Ensure IP whitelist (if applicable)
4. Check environment variables are set

### Slow Performance
1. Enable Vercel Pro for better resources
2. Reduce cold start time
3. Lazy load heavy dependencies
4. Consider alternative platform

See [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) for more troubleshooting.

## 📝 Deployment Log

```
Deployment Date: _____________
Deployed By: _____________
Vercel URL: _____________
Branch: main
Status: ✅ Live / ⏳ Pending / ❌ Failed
```

## 🎯 Success Criteria

After deployment, verify:
- ✅ Health endpoint returns 200
- ✅ GraphQL endpoint accessible
- ✅ Authentication functional
- ✅ Email sending works
- ✅ File uploads work
- ✅ Database readable/writable
- ✅ Redis cache working
- ✅ No errors in logs (first 5 minutes)

## 📞 Support

For issues:
1. Check logs in Vercel Dashboard
2. Review [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)
3. Check [VERCEL_DEPLOYMENT_CHECKLIST.md](./VERCEL_DEPLOYMENT_CHECKLIST.md)
4. Ensure all environment variables are set
5. Test locally with `npm start`

## 🔄 Continuous Deployment

Once deployed:

```bash
# Any push to main will auto-deploy
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically builds and deploys
# Monitor at: https://vercel.com/dashboard
```

---

**Backend is ready for Vercel deployment! 🚀**

Follow the "Quick Start Deploy" section above to get live in minutes.

For detailed information, see the deployment guide and checklist files.
