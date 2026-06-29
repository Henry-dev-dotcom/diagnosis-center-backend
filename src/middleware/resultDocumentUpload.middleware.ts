import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { RESULT_DOCUMENT_ALLOWED_EXTENSIONS, RESULT_DOCUMENT_ALLOWED_MIME_TYPES, RESULT_DOCUMENT_LIMITS } from '../constants/resultDocument.constants';
import { buildStorageFileName, httpError } from '../utils/resultDocument.utils';

const uploadRoot = process.env.RESULT_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'results');

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => cb(null, buildStorageFileName(file.originalname)),
});

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!RESULT_DOCUMENT_ALLOWED_MIME_TYPES.has(file.mimetype) || !RESULT_DOCUMENT_ALLOWED_EXTENSIONS.has(extension)) {
    return cb(httpError('Unsupported result document. Upload PDF, Word, Excel, PNG, JPG, or JPEG files only.', 415));
  }
  return cb(null, true);
}

export const resultDocumentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: RESULT_DOCUMENT_LIMITS.MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

export function singleResultDocument(fieldName = 'document') {
  return resultDocumentUpload.single(fieldName);
}
