import type { Request } from 'express';

export type AnyRecord = Record<string, any>;

export type ScanQueueSearchOptions = {
  search?: string;
  q?: string;
  status?: string;
  priority?: string;
  modality?: string;
  take?: number | string;
  skip?: number | string;
};

export type RequestedScanDTO = {
  orderItemId?: string | null;
  scanId?: string | null;
  scanCode?: string | null;
  scanName: string;
  modality?: string | null;
  bodyPart?: string | null;
  clinicalQuestion?: string | null;
  price?: number | string | null;
  metadata?: AnyRecord | null;
};

export type AcceptScanRequestDTO = {
  selectedScans?: RequestedScanDTO[];
  modality?: string | null;
  room?: string | null;
  machine?: string | null;
  scheduledAt?: string | Date | null;
  technicianNotes?: string | null;
};

export type SaveScanResultDTO = {
  findings?: string;
  impression?: string;
  conclusion?: string;
  recommendation?: string;
  technicianNotes?: string;
  radiologistNotes?: string;
  status?: string;
};

export type ScanDocumentMetadataDTO = {
  originalName: string;
  fileName?: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  checksum?: string | null;
};

export type ScanWorkflowActor = {
  actorId: string;
  actorName?: string | null;
};

export type ScanWorkflowRequest = Request & {
  user?: AnyRecord;
  facilityId?: string;
  resolvedFacilityId?: string;
  facility?: AnyRecord;
  file?: Express.Multer.File;
};
