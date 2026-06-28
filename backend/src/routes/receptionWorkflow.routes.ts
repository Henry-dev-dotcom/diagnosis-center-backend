import { Router } from 'express';
import { ReceptionWorkflowController } from '../controllers/receptionWorkflow.controller';
import { attachFacilityScope, requireFacilityId } from '../middleware/facilityScope.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { requireFacilityFeature } from '../middleware/requireFeature.middleware';
import { FACILITY_ADMIN_ROLES, FINANCE_ROLES, RECEPTION_ROLES } from '../constants/roles';
import { DEFAULT_FACILITY_FEATURES } from '../constants/diagnosticWorkflow.constants';

const router = Router();

router.use(attachFacilityScope, requireFacilityId(), requireFacilityFeature(DEFAULT_FACILITY_FEATURES.RECEPTION));

const receptionAccessRoles = [...RECEPTION_ROLES, ...FACILITY_ADMIN_ROLES];
const receptionReferenceRoles = [...RECEPTION_ROLES, ...FACILITY_ADMIN_ROLES, ...FINANCE_ROLES];

router.get(
  '/reception/walk-ins',
  requireAnyRole(receptionAccessRoles),
  ReceptionWorkflowController.listWalkInPatients,
);

router.get(
  '/reception/walk-ins/search',
  requireAnyRole(receptionAccessRoles),
  ReceptionWorkflowController.listWalkInPatients,
);

router.post(
  '/reception/walk-ins',
  requireAnyRole(receptionAccessRoles),
  ReceptionWorkflowController.createWalkInPatient,
);

router.get(
  '/reception/walk-ins/:patientId',
  requireAnyRole(receptionAccessRoles),
  ReceptionWorkflowController.getWalkInPatient,
);

router.post(
  '/reception/walk-ins/:patientId/request-labs',
  requireAnyRole(receptionAccessRoles),
  ReceptionWorkflowController.requestWalkInLabs,
);

router.post(
  '/reception/walk-ins/:patientId/request-tests',
  requireAnyRole(receptionAccessRoles),
  ReceptionWorkflowController.requestWalkInLabs,
);

router.post(
  '/reception/walk-ins/:patientId/request-scans',
  requireAnyRole(receptionAccessRoles),
  ReceptionWorkflowController.requestWalkInScans,
);

router.get(
  '/reception/walk-ins/:patientId/requests',
  requireAnyRole(receptionReferenceRoles),
  ReceptionWorkflowController.listPatientRequests,
);

// Reference only: reception can view/print copies, but does not push results.
router.get(
  '/reception/results/reference-copies',
  requireAnyRole(receptionReferenceRoles),
  ReceptionWorkflowController.referenceResults,
);

export default router;
