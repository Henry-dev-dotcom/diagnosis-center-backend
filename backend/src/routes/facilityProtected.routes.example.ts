import { Router } from 'express';
import { attachFacilityScope } from '../middleware/facilityScope.middleware';
import { requireFacilityFeature } from '../middleware/requireFeature.middleware';
import { requireFacilityDepartment } from '../middleware/requireDepartment.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { CLINICIAN_ROLES, FACILITY_ADMIN_ROLES, LAB_ROLES, RECEPTION_ROLES, SCAN_ROLES } from '../constants/roles';

// Replace this import with your existing authentication middleware.
// import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Apply after authenticate middleware in your real routes.
// router.use(authenticate);
router.use(attachFacilityScope);

router.use('/admin/facilities', requireAnyRole(FACILITY_ADMIN_ROLES));

router.use(
  '/lab',
  requireAnyRole(LAB_ROLES),
  requireFacilityFeature('laboratory'),
  requireFacilityDepartment('laboratory')
);

router.use(
  '/scan',
  requireAnyRole(SCAN_ROLES),
  requireFacilityFeature('scanImaging')
);

router.use(
  '/reception',
  requireAnyRole(RECEPTION_ROLES),
  requireFacilityFeature('reception')
);

router.use(
  '/clinician',
  requireAnyRole(CLINICIAN_ROLES),
  requireFacilityFeature('clinicianPortal')
);

export default router;
