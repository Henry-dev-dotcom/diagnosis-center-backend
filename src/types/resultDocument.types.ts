export type ResultDocumentOwnerType = 'LAB_TEST' | 'SCAN_REQUEST';

export interface ResultDocumentUploadFile {
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  storageKey?: string | null;
  storageProvider?: string | null;
  checksumSha256?: string | null;
  extension?: string | null;
  documentType?: string | null;
}

export interface AttachLabResultDocumentParams {
  facilityId: string;
  acceptedSampleId: string;
  sampleTestId: string;
  uploadedById: string;
  file: ResultDocumentUploadFile;
  notes?: string | null;
}

export interface AttachScanResultDocumentParams {
  facilityId: string;
  scanAcceptedRequestId: string;
  uploadedById: string;
  file: ResultDocumentUploadFile;
  notes?: string | null;
}

export interface RemoveResultDocumentParams {
  facilityId: string;
  documentId: string;
  actorId: string;
  hardDelete?: boolean;
}

export interface ResultDocumentListOptions {
  search?: unknown;
  q?: unknown;
  take?: unknown;
  skip?: unknown;
}
