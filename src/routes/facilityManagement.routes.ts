import { Router } from 'express';
import { facilityManagementController } from '../controllers/facilityManagement.controller';
import { validateRequest } from '../middleware/validateRequest.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { resolveFacilityScope } from '../middleware/facilityScope.middleware';
import {
  assignFacilityUserValidator,
  createFacilityValidator,
  facilityIdValidator,
  listFacilitiesValidator,
  removeFacilityUserValidator,
  updateBrandingValidator,
  updateCatalogValidator,
  updateDepartmentsValidator,
  updateFacilityStatusValidator,
  updateFacilityValidator,
  updateFeaturesValidator,
  updateLimitsValidator,
  updateRoutingRulesValidator,
} from '../validators/facilityManagement.validators';

const router = Router();

router.use(authenticate);
router.use(resolveFacilityScope);

router.get('/', listFacilitiesValidator, validateRequest, facilityManagementController.listFacilities);
router.post('/', createFacilityValidator, validateRequest, facilityManagementController.createFacility);
router.get('/:facilityId', facilityIdValidator, validateRequest, facilityManagementController.getFacility);
router.patch('/:facilityId', updateFacilityValidator, validateRequest, facilityManagementController.updateFacility);
router.patch('/:facilityId/status', updateFacilityStatusValidator, validateRequest, facilityManagementController.updateStatus);
router.patch('/:facilityId/features', updateFeaturesValidator, validateRequest, facilityManagementController.updateFeatures);
router.patch('/:facilityId/departments', updateDepartmentsValidator, validateRequest, facilityManagementController.updateDepartments);
router.patch('/:facilityId/catalog', updateCatalogValidator, validateRequest, facilityManagementController.replaceCatalog);
router.patch('/:facilityId/routing', updateRoutingRulesValidator, validateRequest, facilityManagementController.updateRoutingRules);
router.patch('/:facilityId/routing-rules', updateRoutingRulesValidator, validateRequest, facilityManagementController.updateRoutingRules);
router.patch('/:facilityId/branding', updateBrandingValidator, validateRequest, facilityManagementController.updateBranding);
router.patch('/:facilityId/limits', updateLimitsValidator, validateRequest, facilityManagementController.updateLimits);
router.post('/:facilityId/users', assignFacilityUserValidator, validateRequest, facilityManagementController.assignUser);
router.delete('/:facilityId/users/:assignmentId', removeFacilityUserValidator, validateRequest, facilityManagementController.removeUser);

export default router;
