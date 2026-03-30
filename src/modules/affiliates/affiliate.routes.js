import { Router } from 'express';
import AffiliateModel from './affiliate.model.js';
import { authenticateAffiliate } from './affiliate.middleware.js';
import { generateAccessToken } from '../../middlewares/auth.middleware.js';
import { successResponse, errorResponse } from '../../core/utils/response.js';
import logger from '../../core/logger/index.js';

const router = Router();

// ── POST /affiliates/auth/register ─────────────────────────────────────────────
router.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;

    if (!fullName?.trim() || !email?.trim() || !password) {
      return res.status(400).json(errorResponse('fullName, email, and password are required', 'BAD_REQUEST'));
    }

    const existing = await AffiliateModel.findByEmail(email);
    if (existing) {
      return res.status(409).json(errorResponse('An account with this email already exists', 'CONFLICT'));
    }

    const affiliate = await AffiliateModel.create({ fullName: fullName.trim(), email, phone, password });
    const token = generateAccessToken({ id: affiliate.id, email: affiliate.email, role: null, type: 'affiliate' });

    const { passwordHash: _pw, ...safeAffiliate } = affiliate;
    logger.info(`[affiliates] registered: ${affiliate.email}`);

    return res.status(201).json(successResponse({ affiliate: safeAffiliate, token }, 'Registration successful. Your account is pending approval.'));
  } catch (err) {
    logger.error('[affiliates] register error:', err);
    return res.status(500).json(errorResponse('Registration failed'));
  }
});

// ── POST /affiliates/auth/login ────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json(errorResponse('email and password are required', 'BAD_REQUEST'));
    }

    const affiliate = await AffiliateModel.findByEmail(email);
    if (!affiliate) {
      return res.status(401).json(errorResponse('Invalid email or password', 'INVALID_CREDENTIALS'));
    }

    if (affiliate.status === 'suspended') {
      return res.status(403).json(errorResponse('Account suspended. Contact support.', 'SUSPENDED'));
    }

    const valid = await AffiliateModel.comparePassword(affiliate, password);
    if (!valid) {
      return res.status(401).json(errorResponse('Invalid email or password', 'INVALID_CREDENTIALS'));
    }

    const token = generateAccessToken({ id: affiliate.id, email: affiliate.email, role: null, type: 'affiliate' });
    const { passwordHash: _pw, ...safeAffiliate } = affiliate;

    return res.status(200).json(successResponse({ affiliate: safeAffiliate, token }, 'Login successful'));
  } catch (err) {
    logger.error('[affiliates] login error:', err);
    return res.status(500).json(errorResponse('Login failed'));
  }
});

// ── GET /affiliates/me ─────────────────────────────────────────────────────────
router.get('/me', authenticateAffiliate, async (req, res) => {
  try {
    const affiliate = await AffiliateModel.findById(req.affiliate.id);
    if (!affiliate) {
      return res.status(404).json(errorResponse('Affiliate not found', 'NOT_FOUND'));
    }

    const { passwordHash: _pw, ...safeAffiliate } = affiliate;
    return res.status(200).json(successResponse(safeAffiliate));
  } catch (err) {
    logger.error('[affiliates] me error:', err);
    return res.status(500).json(errorResponse('Failed to fetch profile'));
  }
});

// ── GET /affiliates/wallet ─────────────────────────────────────────────────────
router.get('/wallet', authenticateAffiliate, async (req, res) => {
  try {
    const wallet = await AffiliateModel.getWallet(req.affiliate.id);
    return res.status(200).json(successResponse(wallet));
  } catch (err) {
    logger.error('[affiliates] wallet error:', err);
    return res.status(500).json(errorResponse('Failed to fetch wallet'));
  }
});

// ── GET /affiliates/wallet/transactions ───────────────────────────────────────
router.get('/wallet/transactions', authenticateAffiliate, async (req, res) => {
  try {
    const transactions = await AffiliateModel.getTransactions(req.affiliate.id);
    return res.status(200).json(successResponse(transactions));
  } catch (err) {
    logger.error('[affiliates] transactions error:', err);
    return res.status(500).json(errorResponse('Failed to fetch transactions'));
  }
});

// ── GET /affiliates/referrals ──────────────────────────────────────────────────
router.get('/referrals', authenticateAffiliate, async (req, res) => {
  try {
    const referrals = await AffiliateModel.getReferrals(req.affiliate.id);
    return res.status(200).json(successResponse(referrals));
  } catch (err) {
    logger.error('[affiliates] referrals error:', err);
    return res.status(500).json(errorResponse('Failed to fetch referrals'));
  }
});

export default router;
