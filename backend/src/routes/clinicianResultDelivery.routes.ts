import { Router } from 'express';
import { ClinicianResultDeliveryController } from '../controllers/clinicianResultDelivery.controller';
import { attachFacilityScope, requireFacilityId } from '../middleware/facilityScope.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { requireFacilityFeature } from '../middleware/requireFeature.middleware';
import { CLINICIAN_ROLES, DIAGNOSTIC_STAFF_ROLES, FACILITY_ADMIN_ROLES } from '../constants/roles';
import { DEFAULT_FACILITY_FEATURES } from '../constants/diagnosticWorkflow.constants';

const router = Router();

router.use(attachFacilityScope, requireFacilityId(), requireFacilityFeature(DEFAULT_FACILITY_FEATURES.RESULT_DELIVERY));

// Staff delivery endpoint used by Lab Accepted Samples and Scan Accepted Requests flows.
router.post(
  '/results/deliver-to-clinician',
  requireAnyRole([...DIAGNOSTIC_STAFF_ROLES, ...FACILITY_ADMIN_ROLES]),
  ClinicianResultDeliveryController.deliverToClinician,
);

// Clinician inbox endpoints.
router.get(
  '/clinician/results',
  requireAnyRole([...CLINICIAN_ROLES, ...FACILITY_ADMIN_ROLES]),
  ClinicianResultDeliveryController.getInbox,
);

router.get(
  '/clinician/results/:inboxId',
  requireAnyRole([...CLINICIAN_ROLES, ...FACILITY_ADMIN_ROLES]),
  ClinicianResultDeliveryController.getOne,
);

router.get(
  '/clinician/results/:inboxId/documents',
  requireAnyRole([...CLINICIAN_ROLES, ...FACILITY_ADMIN_ROLES]),
  ClinicianResultDeliveryController.documents,
);

router.patch(
  '/clinician/results/:inboxId/read',
  requireAnyRole([...CLINICIAN_ROLES, ...FACILITY_ADMIN_ROLES]),
  ClinicianResultDeliveryController.markRead,
);

router.patch(
  '/clinician/results/:inboxId/archive',
  requireAnyRole([...CLINICIAN_ROLES, ...FACILITY_ADMIN_ROLES]),
  ClinicianResultDeliveryController.archive,
);

export default router;
