import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  deleteFileMetadata,
  getDicomStudy,
  getFileDownload,
  getFileMetadata,
  listDicomStudies,
  listFiles,
  uploadFileMetadata
} from '../services/file.service.js';

export const listFilesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listFiles(req.query);
  return sendSuccess(res, 'File metadata loaded successfully', result);
});

export const uploadFileMetadataController = asyncHandler(async (req: Request, res: Response) => {
  const result = await uploadFileMetadata(req.body, req);
  return sendSuccess(res, 'File upload processed successfully', result, result.persisted ? 201 : 202);
});

export const getFileMetadataController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getFileMetadata(req.params.id, req);
  return sendSuccess(res, 'File metadata loaded successfully', result);
});

export const downloadFileController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getFileDownload(req.params.id, req.query, req);
  res.setHeader('Content-Type', result.fileType);
  return res.download(result.absolutePath, result.fileName);
});

export const deleteFileMetadataController = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteFileMetadata(req.params.id, req);
  return sendSuccess(res, 'File deleted successfully', result);
});

export const listDicomStudiesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listDicomStudies(req.query);
  return sendSuccess(res, 'DICOM studies loaded successfully', result);
});

export const getDicomStudyController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getDicomStudy(req.params.studyUid);
  return sendSuccess(res, 'DICOM study loaded successfully', result);
});
