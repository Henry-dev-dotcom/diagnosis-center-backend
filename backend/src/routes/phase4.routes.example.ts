// Add this to backend/src/routes/index.ts after your existing authentication middleware.
// Keep your current auth middleware exactly as it is in your project.

import labWorkflowRoutes from './labWorkflow.routes';
import scanWorkflowRoutes from './scanWorkflow.routes';
import clinicianResultsRoutes from './clinicianResults.routes';
import receptionWorkflowRoutes from './receptionWorkflow.routes';

// app.use('/api/lab', authMiddleware, labWorkflowRoutes);
// app.use('/api/scan', authMiddleware, scanWorkflowRoutes);
// app.use('/api/clinician', authMiddleware, clinicianResultsRoutes);
// app.use('/api/reception', authMiddleware, receptionWorkflowRoutes);
