import type { Request } from 'express';
import type { PatientDocumentCategory } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { sniffBufferType } from './fileStorage.service.js';
import { AppError } from '../utils/appError.js';

/*
  The document vault: letters, reports and consents filed against a patient's record.

  The bytes live in the database. A host's disk can be wiped on every deploy, and a
  referral letter or a signed consent that quietly disappears is the worst failure a
  records system can have; the database is the one place here that is backed up.

  What may be stored is decided by what the file actually is, never by what it is called
  or what the browser says it is: a PDF or a picture, nothing else. Nothing a browser can
  run (HTML, SVG, scripts) can get in, so a document served back can never be an attack.
*/

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENTS_PER_PATIENT = 200;

const KINDS: Record<string, { mime: string; extension: string }> = {
  pdf: { mime: 'application/pdf', extension: 'pdf' },
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  png: { mime: 'image/png', extension: 'png' },
  webp: { mime: 'image/webp', extension: 'webp' }
};

const staff = { select: { id: true, name: true } } as const;
const listSelect = { id: true, title: true, category: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: staff } as const;

async function audit(req: Request, action: string, documentId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Medical records', entityType: 'PatientDocument', entityId: documentId, details });
}

/** The name as stored: letters, digits and a few separators, with the extension the content really has. */
function storedName(fileName: string, extension: string) {
  const base = fileName.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'document';
  return `${base}.${extension}`;
}

export async function listDocuments(patientId: string) {
  if (!(await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } }))) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  const items = await prisma.patientDocument.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, select: listSelect });
  return { items };
}

export async function uploadDocument(
  patientId: string,
  body: { title: string; category: PatientDocumentCategory; fileName: string; contentBase64: string },
  req: Request
) {
  if (!(await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } }))) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');

  const encoded = body.contentBase64.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new AppError('The file could not be read', 400, 'INVALID_BASE64_UPLOAD');
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length === 0) throw new AppError('The file is empty', 400, 'DOCUMENT_EMPTY');
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new AppError(`That file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB. Scan or photograph it at a lower resolution, or split it.`, 413, 'DOCUMENT_TOO_LARGE');
  }

  const kind = KINDS[sniffBufferType(buffer) ?? ''];
  if (!kind) throw new AppError('Only PDF files and pictures (JPEG, PNG or WebP) can be filed here', 415, 'DOCUMENT_TYPE_NOT_ALLOWED');

  const held = await prisma.patientDocument.count({ where: { patientId } });
  if (held >= MAX_DOCUMENTS_PER_PATIENT) throw new AppError('This patient already has the most documents that can be filed', 409, 'DOCUMENT_LIMIT_REACHED');

  const created = await prisma.patientDocument.create({
    data: {
      patientId,
      title: body.title,
      category: body.category,
      fileName: storedName(body.fileName, kind.extension),
      mimeType: kind.mime,
      sizeBytes: buffer.length,
      content: buffer,
      uploadedById: req.user?.id ?? null
    },
    select: listSelect
  });
  // The audit trail says a document was filed and what it was called, never what it contains.
  await audit(req, 'PATIENT_DOCUMENT_UPLOADED', created.id, { patientId, title: created.title, category: created.category, sizeBytes: created.sizeBytes });
  return created;
}

export async function downloadDocument(id: string, req: Request) {
  const doc = await prisma.patientDocument.findUnique({ where: { id }, select: { id: true, patientId: true, title: true, fileName: true, mimeType: true, content: true } });
  if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
  await audit(req, 'PATIENT_DOCUMENT_OPENED', doc.id, { patientId: doc.patientId, title: doc.title });
  return doc;
}
