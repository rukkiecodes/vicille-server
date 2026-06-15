/**
 * Stitchd (multi-tenant SaaS) namespaced resolvers.
 *
 * Per doc 01 §5, this mirrors `stitchd.typeDefs.js`. Batch 00 ships only the public
 * health probe `stitchdPing` (no auth — it must work before any tenant exists). The
 * `requireTailor` guard is implemented in `../stitchd.guard.js` and exported for the
 * tenant-scoped entity resolvers that land in batch 01.
 */
const stitchdResolvers = {
  Query: {
    // Public health probe — intentionally NOT guarded by requireTailor.
    stitchdPing: () => 'stitchd:ok',
  },
};

export default stitchdResolvers;
