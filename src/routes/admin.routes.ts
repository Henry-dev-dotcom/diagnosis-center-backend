import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { moduleLanding } from '../controllers/protectedModule.controller.js';
import { listApiRequestLogs, listAuditLogs, listSystemEvents } from '../controllers/audit.controller.js';
import { adminFullExportController, auditReviewDashboardController, auditReviewExportController } from '../controllers/analytics.controller.js';
import {
  createCatalogItemController,
  createDepartmentController,
  createDoctorController,
  createEquipmentController,
  createHospitalController,
  createReferenceRangeController,
  createUserController,
  exportAdminConfigurationController,
  listCatalogController,
  listDepartmentsController,
  listDoctorsController,
  listEquipmentController,
  listHospitalsController,
  listReferenceRangesController,
  listUsersController,
  updateCatalogItemController,
  updateDepartmentController,
  updateDoctorController,
  updateEquipmentController,
  updateHospitalController,
  updateReferenceRangeController,
  updateUserController
} from '../controllers/adminBusiness.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { dateRangeQuerySchema, idParamSchema, paginationQuerySchema } from '../validators/common.validators.js';
import {
  adminCatalogQuerySchema,
  catalogSchema,
  createUserSchema,
  departmentSchema,
  doctorProfileSchema,
  updateDoctorProfileSchema,
  equipmentSchema,
  hospitalSchema,
  referenceRangeQuerySchema,
  referenceRangeSchema,
  updateCatalogSchema,
  updateDepartmentSchema,
  updateEquipmentSchema,
  updateHospitalSchema,
  updateReferenceRangeSchema,
  updateUserSchema
} from '../validators/admin.validators.js';
import { apiRequestLogQuerySchema, auditLogQuerySchema, systemEventQuerySchema } from '../validators/audit.validators.js';

export const adminRoutes = Router();
adminRoutes.use('/admin', requireAuth, requireRole(UserRole.ADMIN));
adminRoutes.get('/admin', requireAnyPermission(PERMISSIONS.ADMIN_AUDIT_READ, PERMISSIONS.ACCESS_MATRIX_READ), moduleLanding('admin'));
adminRoutes.get('/admin/users', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), validateRequest({ query: paginationQuerySchema }), listUsersController);
adminRoutes.post('/admin/users', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), validateRequest({ body: createUserSchema }), createUserController);
adminRoutes.patch('/admin/users/:id', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), validateRequest({ params: idParamSchema, body: updateUserSchema }), updateUserController);
adminRoutes.get('/admin/hospitals', requirePermission(PERMISSIONS.ADMIN_HOSPITALS_MANAGE), validateRequest({ query: paginationQuerySchema }), listHospitalsController);
adminRoutes.post('/admin/hospitals', requirePermission(PERMISSIONS.ADMIN_HOSPITALS_MANAGE), validateRequest({ body: hospitalSchema }), createHospitalController);
adminRoutes.patch('/admin/hospitals/:id', requirePermission(PERMISSIONS.ADMIN_HOSPITALS_MANAGE), validateRequest({ params: idParamSchema, body: updateHospitalSchema }), updateHospitalController);
adminRoutes.get('/admin/doctors', requirePermission(PERMISSIONS.ADMIN_DOCTORS_MANAGE), validateRequest({ query: paginationQuerySchema }), listDoctorsController);
adminRoutes.post('/admin/doctors', requirePermission(PERMISSIONS.ADMIN_DOCTORS_MANAGE), validateRequest({ body: doctorProfileSchema }), createDoctorController);
adminRoutes.patch('/admin/doctors/:id', requirePermission(PERMISSIONS.ADMIN_DOCTORS_MANAGE), validateRequest({ params: idParamSchema, body: updateDoctorProfileSchema }), updateDoctorController);
adminRoutes.get('/admin/catalog', requirePermission(PERMISSIONS.ADMIN_CATALOG_MANAGE), validateRequest({ query: adminCatalogQuerySchema }), listCatalogController);
adminRoutes.post('/admin/catalog', requirePermission(PERMISSIONS.ADMIN_CATALOG_MANAGE), validateRequest({ body: catalogSchema }), createCatalogItemController);
adminRoutes.patch('/admin/catalog/:id', requirePermission(PERMISSIONS.ADMIN_CATALOG_MANAGE), validateRequest({ params: idParamSchema, body: updateCatalogSchema }), updateCatalogItemController);
adminRoutes.get('/admin/reference-ranges', requirePermission(PERMISSIONS.ADMIN_REFERENCE_RANGES_MANAGE), validateRequest({ query: referenceRangeQuerySchema }), listReferenceRangesController);
adminRoutes.post('/admin/reference-ranges', requirePermission(PERMISSIONS.ADMIN_REFERENCE_RANGES_MANAGE), validateRequest({ body: referenceRangeSchema }), createReferenceRangeController);
adminRoutes.patch('/admin/reference-ranges/:id', requirePermission(PERMISSIONS.ADMIN_REFERENCE_RANGES_MANAGE), validateRequest({ params: idParamSchema, body: updateReferenceRangeSchema }), updateReferenceRangeController);
adminRoutes.get('/admin/departments', requirePermission(PERMISSIONS.ADMIN_DEPARTMENTS_MANAGE), validateRequest({ query: paginationQuerySchema }), listDepartmentsController);
adminRoutes.post('/admin/departments', requirePermission(PERMISSIONS.ADMIN_DEPARTMENTS_MANAGE), validateRequest({ body: departmentSchema }), createDepartmentController);
adminRoutes.patch('/admin/departments/:id', requirePermission(PERMISSIONS.ADMIN_DEPARTMENTS_MANAGE), validateRequest({ params: idParamSchema, body: updateDepartmentSchema }), updateDepartmentController);
adminRoutes.get('/admin/equipment', requirePermission(PERMISSIONS.ADMIN_EQUIPMENT_MANAGE), validateRequest({ query: paginationQuerySchema }), listEquipmentController);
adminRoutes.post('/admin/equipment', requirePermission(PERMISSIONS.ADMIN_EQUIPMENT_MANAGE), validateRequest({ body: equipmentSchema }), createEquipmentController);
adminRoutes.patch('/admin/equipment/:id', requirePermission(PERMISSIONS.ADMIN_EQUIPMENT_MANAGE), validateRequest({ params: idParamSchema, body: updateEquipmentSchema }), updateEquipmentController);
adminRoutes.get('/admin/audit-logs', requirePermission(PERMISSIONS.ADMIN_AUDIT_READ), validateRequest({ query: auditLogQuerySchema }), listAuditLogs);
adminRoutes.get('/admin/system-events', requirePermission(PERMISSIONS.ADMIN_AUDIT_READ), validateRequest({ query: systemEventQuerySchema }), listSystemEvents);
adminRoutes.get('/admin/api-request-logs', requirePermission(PERMISSIONS.ADMIN_AUDIT_READ), validateRequest({ query: apiRequestLogQuerySchema }), listApiRequestLogs);

adminRoutes.get('/admin/audit-summary', requirePermission(PERMISSIONS.ADMIN_AUDIT_READ), validateRequest({ query: dateRangeQuerySchema }), auditReviewDashboardController);
adminRoutes.get('/admin/audit-export', requirePermission(PERMISSIONS.ADMIN_AUDIT_READ), validateRequest({ query: dateRangeQuerySchema }), auditReviewExportController);
adminRoutes.get('/admin/full-export', requireAnyPermission(PERMISSIONS.ADMIN_AUDIT_READ, PERMISSIONS.REPORTS_EXPORT), validateRequest({ query: dateRangeQuerySchema }), adminFullExportController);
adminRoutes.get('/admin/config-export', requireAnyPermission(PERMISSIONS.ADMIN_CATALOG_MANAGE, PERMISSIONS.ADMIN_REFERENCE_RANGES_MANAGE), exportAdminConfigurationController);
