/**
 * Unit tests — user resolvers (phase 8)
 *
 * Covers:
 *  Queries: me (user-only, NOT_FOUND), onboardingStatus, user (auth/NOT_FOUND),
 *           users (admin-only, paginated)
 *  Mutations: updateProfile, updateDeliveryDetails, updatePreferences,
 *             completeOnboardingStep (step >= 4 marks completed),
 *             uploadProfilePhoto (user-only, cloudinary success/failure),
 *             saveStudioPhotos (MAX_PHOTOS=4, url pass-through, base64 upload),
 *             deactivateAccount
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mutable stubs ────────────────────────────────────────────────────────────

const UserModelStub = {
  findById:            async () => null,
  findByIdAndUpdate:   async () => null,
  findByIdAndDelete:   async () => {},
  find:                async () => [],
  countDocuments:      async () => 0,
  updateDeliveryDetails: async () => null,
  updatePreferences:   async () => null,
  findDeliveryDetails: async () => null,
  findPreferences:     async () => null,
};

// Cloudinary — promise-based (user resolver uses await, not callback)
const cloudinaryUploaderTarget = {
  upload: async () => ({ secure_url: 'https://cdn.example.com/photo.jpg', public_id: 'user_1' }),
};

const cloudinaryStub = {
  v2: {
    config:   () => {},
    uploader: { upload: (...a) => cloudinaryUploaderTarget.upload(...a) },
  },
};

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} };

// ─── Module mocks ─────────────────────────────────────────────────────────────

await mock.module('cloudinary',                             { namedExports: cloudinaryStub });
await mock.module('../../src/modules/users/user.model.js',  { defaultExport: UserModelStub });
await mock.module('../../src/core/logger/index.js',         { defaultExport: loggerStub });
await mock.module('../../src/config/cloudinary.js',        {
  namedExports: {
    cloudinaryConfig: {},
    uploadPresets: { profilePhoto: {}, studioPhoto: {} },
  },
});

const { default: userResolvers } = await import('../../src/graphql/resolvers/user.resolvers.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const userCtx   = (id = 'user-1')   => ({ user: { id, role: 'user',   type: 'user'   } });
const tailorCtx = (id = 'tailor-1') => ({ user: { id, role: 'tailor', type: 'tailor' } });
const adminCtx  = ()                 => ({ user: { id: 'admin-1', role: 'admin', type: 'admin' } });

function makeUser(overrides = {}) {
  return {
    id:                  'user-1',
    entityId:            'user-1',
    fullName:            'Ada Obi',
    email:               'ada@example.com',
    onboardingCompleted: false,
    onboardingStep:      2,
    profilePhotoUrl:     null,
    studioPhotos:        [],
    toSafeJSON()         { return { id: this.id, fullName: this.fullName, onboardingStep: this.onboardingStep, onboardingCompleted: this.onboardingCompleted }; },
    ...overrides,
  };
}

// ─── me query ─────────────────────────────────────────────────────────────────

test('me — returns user for authenticated user', async () => {
  UserModelStub.findById = async () => makeUser();

  const result = await userResolvers.Query.me(null, {}, userCtx('user-1'));

  assert.equal(result.id, 'user-1');
  assert.equal(result.fullName, 'Ada Obi');
});

test('me — throws FORBIDDEN for tailor context', async () => {
  await assert.rejects(
    () => userResolvers.Query.me(null, {}, tailorCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('me — throws NOT_FOUND when user record is missing', async () => {
  UserModelStub.findById = async () => null;

  await assert.rejects(
    () => userResolvers.Query.me(null, {}, userCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('me — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => userResolvers.Query.me(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── onboardingStatus query ───────────────────────────────────────────────────

test('onboardingStatus — returns step and completed flag', async () => {
  UserModelStub.findById = async () => makeUser({ onboardingStep: 3, onboardingCompleted: false });

  const result = await userResolvers.Query.onboardingStatus(null, {}, userCtx());

  assert.equal(result.step,      3);
  assert.equal(result.completed, false);
});

test('onboardingStatus — throws FORBIDDEN for tailor', async () => {
  await assert.rejects(
    () => userResolvers.Query.onboardingStatus(null, {}, tailorCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('onboardingStatus — throws NOT_FOUND when user is missing', async () => {
  UserModelStub.findById = async () => null;

  await assert.rejects(
    () => userResolvers.Query.onboardingStatus(null, {}, userCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── user query ───────────────────────────────────────────────────────────────

test('user — returns user when found', async () => {
  UserModelStub.findById = async () => makeUser();

  const result = await userResolvers.Query.user(null, { id: 'user-1' }, userCtx());

  assert.equal(result.id, 'user-1');
});

test('user — throws NOT_FOUND when user does not exist', async () => {
  UserModelStub.findById = async () => null;

  await assert.rejects(
    () => userResolvers.Query.user(null, { id: 'missing' }, userCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── users query (admin) ──────────────────────────────────────────────────────

test('users — returns paginated list for admin', async () => {
  UserModelStub.find           = async () => [makeUser(), makeUser({ id: 'user-2' })];
  UserModelStub.countDocuments = async () => 2;

  const result = await userResolvers.Query.users(
    null, { filter: {}, pagination: { page: 1, limit: 20 } }, adminCtx()
  );

  assert.equal(result.nodes.length, 2);
  assert.equal(result.pageInfo.total, 2);
});

test('users — throws FORBIDDEN for authenticated non-admin', async () => {
  await assert.rejects(
    () => userResolvers.Query.users(null, {}, userCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── updateProfile ────────────────────────────────────────────────────────────

test('updateProfile — updates and returns user', async () => {
  UserModelStub.findByIdAndUpdate = async () => makeUser({ fullName: 'Updated Ada' });

  const result = await userResolvers.Mutation.updateProfile(
    null, { input: { fullName: 'Updated Ada' } }, userCtx()
  );

  assert.equal(result.fullName, 'Updated Ada');
});

test('updateProfile — throws NOT_FOUND when user does not exist', async () => {
  UserModelStub.findByIdAndUpdate = async () => null;

  await assert.rejects(
    () => userResolvers.Mutation.updateProfile(null, { input: { fullName: 'X' } }, userCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

test('updateProfile — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => userResolvers.Mutation.updateProfile(null, { input: {} }, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});

// ─── updateDeliveryDetails ────────────────────────────────────────────────────

test('updateDeliveryDetails — updates and returns user', async () => {
  UserModelStub.updateDeliveryDetails = async () =>
    makeUser({ id: 'user-1' });

  const result = await userResolvers.Mutation.updateDeliveryDetails(
    null,
    { input: { address: '12 Lagos St', phone: '08012345678' } },
    userCtx()
  );

  assert.equal(result.id, 'user-1');
});

test('updateDeliveryDetails — throws NOT_FOUND when user does not exist', async () => {
  UserModelStub.updateDeliveryDetails = async () => null;

  await assert.rejects(
    () => userResolvers.Mutation.updateDeliveryDetails(null, { input: {} }, userCtx()),
    (err) => { assert.equal(err.extensions?.code, 'NOT_FOUND'); return true; }
  );
});

// ─── completeOnboardingStep ───────────────────────────────────────────────────

test('completeOnboardingStep — marks onboardingCompleted when step >= 4', async () => {
  const updateCalls = [];
  UserModelStub.findById = async () => makeUser({ onboardingStep: 3 });
  UserModelStub.findByIdAndUpdate = async (id, patch) => {
    updateCalls.push(patch);
    return makeUser({ onboardingStep: 4, onboardingCompleted: patch.onboardingCompleted });
  };

  const result = await userResolvers.Mutation.completeOnboardingStep(null, { step: 4 }, userCtx());

  const call = updateCalls[0];
  assert.equal(call.onboardingCompleted, true);
  assert.equal(result.onboardingCompleted, true);
});

test('completeOnboardingStep — does NOT mark completed when step < 4', async () => {
  const updateCalls = [];
  UserModelStub.findById = async () => makeUser({ onboardingStep: 1 });
  UserModelStub.findByIdAndUpdate = async (id, patch) => {
    updateCalls.push(patch);
    return makeUser({ onboardingStep: 2, onboardingCompleted: false });
  };

  await userResolvers.Mutation.completeOnboardingStep(null, { step: 2 }, userCtx());

  assert.equal(updateCalls[0].onboardingCompleted, undefined);
});

// ─── uploadProfilePhoto ───────────────────────────────────────────────────────

test('uploadProfilePhoto — uploads to cloudinary and updates profile photo', async () => {
  cloudinaryUploaderTarget.upload = async () => ({
    secure_url: 'https://cdn.example.com/profile.jpg',
    public_id:  'user_user-1',
  });
  UserModelStub.findByIdAndUpdate = async () => makeUser({ profilePhotoUrl: 'https://cdn.example.com/profile.jpg' });

  const result = await userResolvers.Mutation.uploadProfilePhoto(
    null, { base64: 'abc123', mimeType: 'image/jpeg' }, userCtx('user-1')
  );

  assert.ok(result.id, 'Expected user returned');
});

test('uploadProfilePhoto — throws FORBIDDEN for tailor context', async () => {
  await assert.rejects(
    () => userResolvers.Mutation.uploadProfilePhoto(null, { base64: 'x', mimeType: 'image/jpeg' }, tailorCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

test('uploadProfilePhoto — throws UPLOAD_FAILED when cloudinary rejects', async () => {
  cloudinaryUploaderTarget.upload = async () => { throw new Error('Cloudinary error'); };

  await assert.rejects(
    () => userResolvers.Mutation.uploadProfilePhoto(null, { base64: 'x', mimeType: 'image/jpeg' }, userCtx()),
    (err) => { assert.equal(err.extensions?.code, 'UPLOAD_FAILED'); return true; }
  );
});

// ─── saveStudioPhotos ─────────────────────────────────────────────────────────

test('saveStudioPhotos — passes through existing URLs without re-uploading', async () => {
  const updateCalls = [];
  UserModelStub.findByIdAndUpdate = async (id, patch) => {
    updateCalls.push(patch);
    return makeUser();
  };

  await userResolvers.Mutation.saveStudioPhotos(
    null,
    { photos: [{ url: 'https://cdn.example.com/existing.jpg', mimeType: 'image/jpeg' }] },
    userCtx('user-1')
  );

  assert.equal(updateCalls[0].studioPhotos[0].url, 'https://cdn.example.com/existing.jpg');
});

test('saveStudioPhotos — caps photos at MAX_PHOTOS (4)', async () => {
  const updateCalls = [];
  cloudinaryUploaderTarget.upload = async () => ({ secure_url: 'https://cdn.example.com/x.jpg', public_id: 'x' });
  UserModelStub.findByIdAndUpdate = async (id, patch) => {
    updateCalls.push(patch);
    return makeUser();
  };

  const fivePhotos = Array.from({ length: 5 }, (_, i) => ({
    url: `https://cdn.example.com/${i}.jpg`, mimeType: 'image/jpeg',
  }));

  await userResolvers.Mutation.saveStudioPhotos(null, { photos: fivePhotos }, userCtx('user-1'));

  assert.equal(updateCalls[0].studioPhotos.length, 4);
});

test('saveStudioPhotos — throws FORBIDDEN for tailor context', async () => {
  await assert.rejects(
    () => userResolvers.Mutation.saveStudioPhotos(null, { photos: [] }, tailorCtx()),
    (err) => { assert.equal(err.extensions?.code, 'FORBIDDEN'); return true; }
  );
});

// ─── deactivateAccount ────────────────────────────────────────────────────────

test('deactivateAccount — deletes user and returns success', async () => {
  UserModelStub.findByIdAndDelete = async () => {};

  const result = await userResolvers.Mutation.deactivateAccount(null, {}, userCtx('user-1'));

  assert.equal(result.success, true);
});

test('deactivateAccount — throws UNAUTHENTICATED when no auth context', async () => {
  await assert.rejects(
    () => userResolvers.Mutation.deactivateAccount(null, {}, {}),
    (err) => { assert.equal(err.extensions?.code, 'UNAUTHENTICATED'); return true; }
  );
});
