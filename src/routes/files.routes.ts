import { Router } from 'express';
import { UserRole } from '@prisma/client';
import {
  deleteFileMetadataController,
  downloadFileController,
  getDicomStudyController,
  getFileMetadataController,
  listDicomStudiesController,
  listFilesController,
  uploadFileMetadataController
} from '../controllers/file.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema, paginationQuerySchema } from '../validators/common.validators.js';
import { dicomStudyParamSchema, fileQuerySchema, fileUploadSchema } from '../validators/file.validators.js';

export const filesRoutes = Router();
filesRoutes.use('/files', requireAuth, requireRole(UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF, UserRole.DOCTOR, UserRole.RECEPTIONIST));
filesRoutes.get('/files', requirePermission(PERMISSIONS.FILES_READ), validateRequest({ query: fileQuerySchema }), listFilesController);
filesRoutes.post('/files/upload', requireAnyPermission(PERMISSIONS.FILES_UPLOAD, PERMISSIONS.SCAN_FILES_UPLOAD), validateRequest({ body: fileUploadSchema }), uploadFileMetadataController);
filesRoutes.get('/files/dicom/studies', requireAnyPermission(PERMISSIONS.FILES_READ, PERMISSIONS.SCAN_QUEUE_READ), validateRequest({ query: paginationQuerySchema }), listDicomStudiesController);
filesRoutes.get('/files/dicom/studies/:studyUid', requireAnyPermission(PERMISSIONS.FILES_READ, PERMISSIONS.SCAN_QUEUE_READ), validateRequest({ params: dicomStudyParamSchema }), getDicomStudyController);
filesRoutes.get('/files/:id', requirePermission(PERMISSIONS.FILES_READ), validateRequest({ params: idParamSchema }), getFileMetadataController);
filesRoutes.get('/files/:id/download', requirePermission(PERMISSIONS.FILES_READ), validateRequest({ params: idParamSchema }), downloadFileController);
filesRoutes.delete('/files/:id', requirePermission(PERMISSIONS.FILES_DELETE), validateRequest({ params: idParamSchema }), deleteFileMetadataController);
