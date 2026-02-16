# Vercel Deployment Pre-Flight Checklist

Complete this checklist before deploying to Vercel.

## ✅ Project Setup

- [ ] All code committed to GitHub repository
- [ ] README.md exists and is up-to-date
- [ ] package.json has correct versions and build scripts
- [ ] .gitignore properly configured (excludes .env, node_modules, etc.)
- [ ] .vercelignore created (provided)
- [ ] vercel.json created (provided)
- [ ] api/index.js created (provided)

## ✅ Environment Variables

Create a file with all the required environment variables:
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `HOST=0.0.0.0`
- [ ] `JWT_SECRET` (strong random value, min 32 chars)
- [ ] `JWT_REFRESH_SECRET` (strong random value, min 32 chars)
- [ ] `REDIS_URL` (from Redis Cloud or Upstash)
- [ ] `MAILING_EMAIL` (SMTP email)
- [ ] `MAILING_PASSWORD` (SMTP password or app password)
- [ ] `SMTP_HOST` (typically smtp.gmail.com)
- [ ] `SMTP_PORT` (typically 587)
- [ ] `CLOUDINARY_CLOUD_NAME`
- [ ] `CLOUDINARY_API_KEY`
- [ ] `CLOUDINARY_API_SECRET`
- [ ] `PAYSTACK_PUBLIC_KEY`
- [ ] `PAYSTACK_SECRET_KEY`
- [ ] `PAYMENT_WEBHOOK_SECRET`
- [ ] `SOCKET_CORS_ORIGIN` (your frontend URL)
- [ ] `CLIENT_APP_URL`
- [ ] `ADMIN_APP_URL`
- [ ] `WEBSITE_URL`
- [ ] All other settings from `.env.example`

## ✅ External Services Setup

### Redis
- [ ] Redis service created (Upstash, Redis Cloud, or similar)
- [ ] Redis URL verified and tested locally
- [ ] Connection timeouts configured if needed
- [ ] IP whitelist updated (if applicable)

### Firebase
- [ ] Firebase project created
- [ ] Service account JSON downloaded
- [ ] Service account has Firestore access
- [ ] Service account has Authentication access
- [ ] Firestore database initialized
- [ ] Firebase rules updated for production

### Email (SMTP)
- [ ] Email account created (Gmail, SendGrid, etc.)
- [ ] App password generated (not account password)
- [ ] SMTP credentials verified locally
- [ ] Test email sent successfully

### Cloudinary
- [ ] Account created
- [ ] API credentials obtained
- [ ] Upload presets configured (if needed)
- [ ] Transformations tested

### Payment Provider (Paystack)
- [ ] Paystack account created with test keys
- [ ] API keys obtained
- [ ] Webhook URL configured: `https://your-app.vercel.app/webhooks/payment`
- [ ] Webhook secret generated
- [ ] Test transaction completed

## ✅ Code Quality

- [ ] No sensitive data hardcoded (run: `grep -r "sk_" src/`)
- [ ] No console.logs in production code (use logger instead)
- [ ] Error handling is comprehensive
- [ ] All APIs have proper validation
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Security headers configured

## ✅ Database & Migrations

- [ ] Firestore collection structure defined
- [ ] Database indexes created
- [ ] Test data seeded (optional)
- [ ] Backup strategy planned

## ✅ Testing

- [ ] Unit tests passing: `npm run test:unit`
- [ ] Integration tests passing: `npm run test:integration`
- [ ] GraphQL queries tested
- [ ] Endpoints tested with curl/Postman
- [ ] Health check endpoint working

## ✅ GitHub Setup

- [ ] Repository is public (or add Vercel as collaborator)
- [ ] Branch protection rules configured (optional)
- [ ] Secrets not committed (check with: `git log -p` for secrets)

## ✅ Vercel Setup

- [ ] Vercel account created
- [ ] GitHub repository connected
- [ ] Environment variables added in Vercel dashboard
- [ ] Build settings configured:
  - Build Command: (leave empty or `npm install`)
  - Output Directory: (empty)
  - Install Command: `npm install`
  - Development Command: `npm run dev`
- [ ] Vercel domain or custom domain configured

## ✅ Pre-Deployment Testing

Run these commands locally before deployment:

```bash
# Check for syntax errors
npm run lint

# Run all tests
npm run test

# Start server locally
npm start

# Test GraphQL endpoint
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'

# Test health endpoint
curl http://localhost:4000/health
```

- [ ] Server starts without errors
- [ ] All endpoints respond correctly
- [ ] Database connections work
- [ ] Email sending works
- [ ] File uploads work
- [ ] GraphQL explorer accessible

## ✅ Deployment Steps

1. [ ] Test everything locally
2. [ ] Commit all changes: `git add . && git commit -m "Ready for Vercel deployment"`
3. [ ] Push to GitHub: `git push origin main`
4. [ ] Open Vercel dashboard
5. [ ] Add environment variables in Vercel
6. [ ] Click Deploy
7. [ ] Monitor deployment logs
8. [ ] Test deployed application

## ✅ Post-Deployment Verification

After deployment:

1. [ ] Health check endpoint responds
2. [ ] GraphQL endpoint accessible
3. [ ] GraphQL queries work
4. [ ] Authentication works
5. [ ] Email notifications sent
6. [ ] File uploads working
7. [ ] Payment webhook received
8. [ ] Redis connection working
9. [ ] Firebase database accessible
10. [ ] Logs are being collected

## ✅ Monitoring Setup

- [ ] Vercel analytics enabled
- [ ] Error tracking (Sentry) configured
- [ ] Uptime monitoring configured
- [ ] Slack/Email alerts configured
- [ ] Log aggregation configured

## ✅ Security Checklist

- [ ] HTTPS enforced in Vercel settings
- [ ] CORS origin properly configured
- [ ] API keys rotated before first deployment
- [ ] Secret scanning enabled on GitHub
- [ ] Helmet security headers active
- [ ] Rate limiting active
- [ ] JWT expiration times reasonable

## ✅ Documentation

- [ ] VERCEL_DEPLOYMENT_GUIDE.md updated
- [ ] API documentation current
- [ ] Environment variables documented
- [ ] Troubleshooting guide created

## 🚨 Emergency Contacts & Escalation

- [ ] Vercel support account set up
- [ ] Firebase support available
- [ ] Redis support contact noted
- [ ] Incident response plan documented

---

**Deployment Ready:** Once all items are checked, you're ready to deploy!

**Date Completed:** ____________________

**Deployed By:** ____________________

**Deployment URL:** ____________________
