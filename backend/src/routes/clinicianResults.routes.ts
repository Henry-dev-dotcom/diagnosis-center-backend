import { Router } from 'express';
import { ClinicianResultsController } from '../controllers/clinicianResults.controller';
import { attachFacilityScope, requireFacilityId } from '../middleware/facilityScope.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { requireFacilityFeature } from '../middleware/requireFeature.middleware';
import { CLINICIAN_ROLES, FACILITY_ADMIN_ROLES } from '../constants/roles';
import { DEFAULT_FACILITY_FEATURES } from '../constants/diagnosticWorkflow.constants';

const router = Router();

router.use(attachFacilityScope, requireFacilityId(), requireFacilityFeature(DEFAULT_FACILITY_FEATURES.RESULT_DELIVERY));

router.get('/results', requireAnyRole([...CLINICIAN_ROLES, ...FACILITY_ADMIN_ROLES]), ClinicianResultsController.getInbox);
router.patch('/results/:resultId/read', requireAnyRole([...CLINICIAN_ROLES, ...FACILITY_ADMIN_ROLES]), ClinicianResultsController.markRead);

export default router;
