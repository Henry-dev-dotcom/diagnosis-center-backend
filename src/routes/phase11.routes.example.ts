import workflowTrackingRoutes from './workflowTracking.routes';

// Register under admin routes, with your existing auth/role/facility middleware:
// router.use('/admin/workflow-events', requireAuth, requireRoles(['SUPER_ADMIN', 'ADMIN', 'FACILITY_ADMIN']), workflowTrackingRoutes);

export { workflowTrackingRoutes };
