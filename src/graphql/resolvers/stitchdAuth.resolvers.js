/**
 * Stitchd auth & onboarding resolvers (batch 01).
 *
 * Phone-OTP tailor signup + multi-tenant onboarding. A Stitchd tailor = a row in
 * `tailors` (tailor_type='stitchd') + a row in `stitchd_tailor_profile`. The tenant id
 * is `tailors.id` — exactly what `requireTailor(context)` returns.
 *
 * Tenant isolation (doc 01 §3): every tenant-scoped read/write goes through
 * StitchdTailorProfileModel, whose methods all filter by the guard-resolved tailorId.
 */
import { GraphQLError } from 'graphql';
import bcrypt from 'bcryptjs';
import { query } from '../../infrastructure/database/postgres.js';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../../middlewares/auth.middleware.js';
import { generateActivationCode } from '../../core/utils/randomCode.js';
import { generateRandomBase64, hashPassword } from '../../core/utils/crypto.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import StitchdTeamModel from '../../modules/stitchd/stitchdTeam.model.js';
import { requireTailor } from '../stitchd.guard.js';
import termiiService from '../../services/termii.service.js';
import logger from '../../core/logger/index.js';

const OTP_TTL_SECONDS = 600;          // 10 minutes
const OTP_TTL_MS = OTP_TTL_SECONDS * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;   // reject resend within 30s
const OTP_MAX_UNCONSUMED_PER_HOUR = 5;      // cap unconsumed codes per phone / hour
const OTP_MAX_ATTEMPTS = 5;
const OTP_SALT_ROUNDS = 8;             // OTPs are short-lived & low-entropy; modest cost is fine

/**
 * Normalize a phone number to digits (drop spaces, dashes, parens, leading '+').
 * Stored & looked-up in this canonical form. Returns null for empty/invalid input.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits.length ? digits : null;
}

/** Build the synthetic, unique email used to satisfy tailors.email (UNIQUE NOT NULL). */
function syntheticEmailForPhone(phoneDigits) {
  return `stitchd_${phoneDigits}@stitchd.app`;
}

/**
 * Resolve the StitchdTailor projection for a tailor id, or throw NOT_FOUND.
 * Used after auth/mutation to return the contract shape.
 */
async function resolveStitchdTailorOrThrow(tailorId) {
  const tailor = await StitchdTailorProfileModel.findByTailorId(tailorId);
  if (!tailor) {
    throw new GraphQLError('Stitchd tailor profile not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }
  return tailor;
}

/**
 * Find an existing, non-deleted Stitchd tailor row by normalized phone.
 * Scoped to tailor_type='stitchd' so it never collides with Vicelle/Style-U tailors.
 */
async function findStitchdTailorRowByPhone(phoneDigits) {
  const { rows } = await query(
    `SELECT id, email, phone FROM tailors
      WHERE phone = $1 AND tailor_type = 'stitchd' AND is_deleted = FALSE
      ORDER BY created_at ASC
      LIMIT 1`,
    [phoneDigits]
  );
  return rows[0] || null;
}

/**
 * Create a brand-new Stitchd tenant: a `tailors` row (synthetic email + random unused
 * password) plus its `stitchd_tailor_profile` row (30-day trial). Returns { tailorId, email }.
 *
 * NB: we INSERT into tailors directly (not TailorModel.create) because that helper only
 * emits tailor_type 'vicelle'|'styleu'. Migration 038 widens the CHECK to allow 'stitchd'.
 */
async function createStitchdTenant(phoneDigits) {
  const email = syntheticEmailForPhone(phoneDigits);
  const passwordHash = await hashPassword(generateRandomBase64(24)); // never used to log in
  const fullName = phoneDigits || 'New tailor';

  const { rows } = await query(
    `INSERT INTO tailors (full_name, email, phone, password_hash, status, tailor_type)
     VALUES ($1,$2,$3,$4,'active','stitchd')
     RETURNING id, email`,
    [fullName, email, phoneDigits, passwordHash]
  );
  const tailorId = rows[0].id;

  await StitchdTailorProfileModel.createForTailor(tailorId, {
    subscriptionStatus: 'trial',
    tier: 'starter',
  });

  return { tailorId, email: rows[0].email };
}

const stitchdAuthResolvers = {
  Query: {
    stitchdTailor: async (_parent, _args, context) => {
      const tailorId = requireTailor(context);
      // Tenant-scoped read — only the caller's own profile. null if not a Stitchd tailor.
      return StitchdTailorProfileModel.findByTailorId(tailorId);
    },
  },

  Mutation: {
    requestStitchdOtp: async (_parent, { phone }) => {
      const phoneDigits = normalizePhone(phone);
      if (!phoneDigits) {
        throw new GraphQLError('A valid phone number is required.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        // ── Rate limiting (per phone) ────────────────────────────────────────────
        const { rows: recent } = await query(
          `SELECT created_at FROM stitchd_phone_otps
            WHERE phone = $1 AND consumed_at IS NULL
              AND created_at > now() - INTERVAL '1 hour'
            ORDER BY created_at DESC`,
          [phoneDigits]
        );

        if (recent.length) {
          const lastIssued = new Date(recent[0].created_at).getTime();
          if (Date.now() - lastIssued < OTP_RESEND_COOLDOWN_MS) {
            throw new GraphQLError(
              'Please wait a moment before requesting another code.',
              { extensions: { code: 'TOO_MANY_REQUESTS' } }
            );
          }
        }
        if (recent.length >= OTP_MAX_UNCONSUMED_PER_HOUR) {
          throw new GraphQLError(
            'Too many code requests. Please try again later.',
            { extensions: { code: 'TOO_MANY_REQUESTS' } }
          );
        }

        // ── Generate + store hashed code ─────────────────────────────────────────
        const code = generateActivationCode(6);
        const codeHash = await bcrypt.hash(code, OTP_SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        await query(
          `INSERT INTO stitchd_phone_otps (phone, code_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [phoneDigits, codeHash, expiresAt]
        );

        // ── Deliver via Termii (dev-fallback when unconfigured) ──────────────────
        const message = `Your Stitchd verification code is ${code}. It expires in 10 minutes.`;
        const result = await termiiService.sendSms({ to: phoneDigits, message });

        // devCode is exposed ONLY when no SMS provider is configured (testability).
        const devCode = process.env.TERMII_API_KEY ? null : code;

        return {
          success: true,
          message: result.delivered
            ? 'A verification code has been sent to your phone.'
            : 'Verification code generated. (SMS provider not configured.)',
          expiresInSeconds: OTP_TTL_SECONDS,
          devCode,
        };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('requestStitchdOtp error:', error);
        throw new GraphQLError('Could not send verification code. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    verifyStitchdOtp: async (_parent, { phone, code }) => {
      const phoneDigits = normalizePhone(phone);
      if (!phoneDigits || !code) {
        throw new GraphQLError('Phone and code are required.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        // Latest unconsumed, unexpired OTP for this phone.
        const { rows } = await query(
          `SELECT * FROM stitchd_phone_otps
            WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1`,
          [phoneDigits]
        );
        const otp = rows[0];

        if (!otp) {
          throw new GraphQLError(
            'That code has expired or is invalid. Please request a new one.',
            { extensions: { code: 'UNAUTHENTICATED' } }
          );
        }

        if (otp.attempts >= OTP_MAX_ATTEMPTS) {
          throw new GraphQLError(
            'Too many incorrect attempts. Please request a new code.',
            { extensions: { code: 'UNAUTHENTICATED' } }
          );
        }

        const matches = await bcrypt.compare(String(code), otp.code_hash);
        if (!matches) {
          await query(
            'UPDATE stitchd_phone_otps SET attempts = attempts + 1 WHERE id = $1',
            [otp.id]
          );
          throw new GraphQLError(
            'That code is incorrect. Please check and try again.',
            { extensions: { code: 'UNAUTHENTICATED' } }
          );
        }

        // Success — consume the code.
        await query(
          'UPDATE stitchd_phone_otps SET consumed_at = now() WHERE id = $1',
          [otp.id]
        );

        // ── Team-member login (batch 16): if this phone is a member of a tenant, sign in
        // as a sub-user of the OWNER's tenant (not a new tenant of their own). ──────────
        const membership = await StitchdTeamModel.membershipByPhone(phoneDigits);
        if (membership) {
          const member = await StitchdTeamModel.acceptOnLogin(membership);
          const memberPayload = {
            id: member.id, email: null, role: 'tailor', type: 'tailor',
            stitchdTailorId: member.tailor_id, memberId: member.id, memberRole: member.role,
          };
          const ownerTailor = await resolveStitchdTailorOrThrow(member.tailor_id);
          return {
            accessToken: generateAccessToken(memberPayload),
            refreshToken: generateRefreshToken(memberPayload),
            type: 'member',
            isNewTailor: false,
            tailor: ownerTailor,
          };
        }

        // Resolve or create the tenant.
        let tailorRow = await findStitchdTailorRowByPhone(phoneDigits);
        let isNewTailor = false;
        let tailorId;
        let email;

        if (tailorRow) {
          tailorId = tailorRow.id;
          email = tailorRow.email;
          // Self-heal: ensure a profile row exists (e.g. partial prior signup).
          const existingProfile = await StitchdTailorProfileModel.findRowByTailorId(tailorId);
          if (!existingProfile) {
            await StitchdTailorProfileModel.createForTailor(tailorId, {
              subscriptionStatus: 'trial',
              tier: 'starter',
            });
          }
        } else {
          const created = await createStitchdTenant(phoneDigits);
          tailorId = created.tailorId;
          email = created.email;
          isNewTailor = true;
        }

        const tokenPayload = { id: tailorId, email, role: 'tailor', type: 'tailor' };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);
        const tailor = await resolveStitchdTailorOrThrow(tailorId);

        return {
          accessToken,
          refreshToken,
          type: 'tailor',
          isNewTailor,
          tailor,
        };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('verifyStitchdOtp error:', error);
        throw new GraphQLError('Verification failed. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    completeStitchdBusinessProfile: async (_parent, { input }, context) => {
      const tailorId = requireTailor(context);
      try {
        // Ensure a profile row exists before updating (tenant-scoped).
        const existing = await StitchdTailorProfileModel.findRowByTailorId(tailorId);
        if (!existing) {
          await StitchdTailorProfileModel.createForTailor(tailorId, {
            subscriptionStatus: 'trial',
            tier: 'starter',
          });
        }

        // Tenant-scoped update — WHERE tailor_id = the caller's own id.
        await StitchdTailorProfileModel.update(tailorId, {
          businessName:  input.businessName?.trim(),
          ownerName:     input.ownerName?.trim(),
          locationCity:  input.locationCity?.trim(),
          locationArea:  input.locationArea?.trim() ?? null,
          specialties:   input.specialties ?? null,
          logoUrl:       input.logoUrl ?? null,
          ownerPhotoUrl: input.ownerPhotoUrl ?? null,
        });

        return resolveStitchdTailorOrThrow(tailorId);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('completeStitchdBusinessProfile error:', error);
        throw new GraphQLError('Could not save your business profile. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },
  },
};

export default stitchdAuthResolvers;
