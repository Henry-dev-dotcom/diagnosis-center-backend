// Backend Phase 14 route registration example.
// Add this inside backend/src/routes/index.ts after your existing authentication middleware.

import diagnosticPlatformRoutes from './diagnosticPlatform.routes';

// If backend/src/routes/index.ts is mounted under /api in app.ts:
// router.use('/', diagnosticPlatformRoutes);

// If you register directly in app.ts instead:
// app.use('/api', diagnosticPlatformRoutes);

export { diagnosticPlatformRoutes };
