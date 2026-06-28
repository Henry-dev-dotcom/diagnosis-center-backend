// Register this in backend/src/routes/index.ts or backend/src/app.ts
// after Phase 2 and Phase 3 have been applied.

import facilityManagementRoutes from './facilityManagement.routes';

// Example:
// router.use('/admin/facilities', facilityManagementRoutes);
// or, if your API root is mounted before routes:
// app.use('/api/admin/facilities', facilityManagementRoutes);

export { facilityManagementRoutes };
