import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  createCatalogItem,
  createDepartment,
  createDoctor,
  createEquipment,
  createHospital,
  createReferenceRange,
  createUser,
  deactivateUser,
  exportAdminConfiguration,
  listCatalog,
  listDepartments,
  listDoctors,
  listEquipment,
  listHospitals,
  listReferenceRanges,
  listUsers,
  updateCatalogItem,
  updateDepartment,
  updateDoctor,
  updateEquipment,
  updateHospital,
  updateReferenceRange,
  updateUser
} from '../services/adminBusiness.service.js';

export const listUsersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listUsers(req.query);
  return sendSuccess(res, 'Users loaded successfully', result);
});

export const createUserController = asyncHandler(async (req: Request, res: Response) => {
  const user = await createUser(req.body, req);
  return sendCreated(res, 'User created successfully', user);
});

export const updateUserController = asyncHandler(async (req: Request, res: Response) => {
  const user = await updateUser(req.params.id, req.body, req);
  return sendSuccess(res, 'User updated successfully', user);
});

export const deactivateUserController = asyncHandler(async (req: Request, res: Response) => {
  const user = await deactivateUser(req.params.id, req);
  return sendSuccess(res, 'User status updated successfully', user);
});

export const listHospitalsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listHospitals(req.query);
  return sendSuccess(res, 'Hospitals loaded successfully', result);
});

export const createHospitalController = asyncHandler(async (req: Request, res: Response) => {
  const hospital = await createHospital(req.body, req);
  return sendCreated(res, 'Hospital created successfully', hospital);
});

export const updateHospitalController = asyncHandler(async (req: Request, res: Response) => {
  const hospital = await updateHospital(req.params.id, req.body, req);
  return sendSuccess(res, 'Hospital updated successfully', hospital);
});

export const listDoctorsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listDoctors(req.query);
  return sendSuccess(res, 'Doctors loaded successfully', result);
});

export const createDoctorController = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await createDoctor(req.body, req);
  return sendCreated(res, 'Doctor profile created successfully', doctor);
});

export const updateDoctorController = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await updateDoctor(req.params.id, req.body, req);
  return sendSuccess(res, 'Doctor profile updated successfully', doctor);
});

export const listCatalogController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listCatalog(req.query);
  return sendSuccess(res, 'Catalog loaded successfully', result);
});

export const createCatalogItemController = asyncHandler(async (req: Request, res: Response) => {
  const item = await createCatalogItem(req.body, req);
  return sendCreated(res, 'Catalog item created successfully', item);
});

export const updateCatalogItemController = asyncHandler(async (req: Request, res: Response) => {
  const item = await updateCatalogItem(req.params.id, req.body, req);
  return sendSuccess(res, 'Catalog item updated successfully', item);
});

export const listReferenceRangesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listReferenceRanges(req.query);
  return sendSuccess(res, 'Reference ranges loaded successfully', result);
});

export const createReferenceRangeController = asyncHandler(async (req: Request, res: Response) => {
  const range = await createReferenceRange(req.body, req);
  return sendCreated(res, 'Reference range created successfully', range);
});

export const updateReferenceRangeController = asyncHandler(async (req: Request, res: Response) => {
  const range = await updateReferenceRange(req.params.id, req.body, req);
  return sendSuccess(res, 'Reference range updated successfully', range);
});

export const listDepartmentsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listDepartments(req.query);
  return sendSuccess(res, 'Departments loaded successfully', result);
});

export const createDepartmentController = asyncHandler(async (req: Request, res: Response) => {
  const department = await createDepartment(req.body, req);
  return sendCreated(res, 'Department created successfully', department);
});

export const updateDepartmentController = asyncHandler(async (req: Request, res: Response) => {
  const department = await updateDepartment(req.params.id, req.body, req);
  return sendSuccess(res, 'Department updated successfully', department);
});

export const listEquipmentController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listEquipment(req.query);
  return sendSuccess(res, 'Equipment loaded successfully', result);
});

export const createEquipmentController = asyncHandler(async (req: Request, res: Response) => {
  const equipment = await createEquipment(req.body, req);
  return sendCreated(res, 'Equipment created successfully', equipment);
});

export const updateEquipmentController = asyncHandler(async (req: Request, res: Response) => {
  const equipment = await updateEquipment(req.params.id, req.body, req);
  return sendSuccess(res, 'Equipment updated successfully', equipment);
});

export const exportAdminConfigurationController = asyncHandler(async (_req: Request, res: Response) => {
  const config = await exportAdminConfiguration();
  return sendSuccess(res, 'Admin configuration exported successfully', config);
});
