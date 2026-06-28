export type LabPriority = 'ROUTINE' | 'URGENT' | string;

export type LabAcceptedSampleStatus = 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SENT_TO_CLINICIAN' | string;
export type LabAcceptedTestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | string;

export type LabQueueSearchOptions = {
  search?: string;
  q?: string;
  take?: number | string;
  skip?: number | string;
  status?: string;
  priority?: string;
};

export type RequestedLabTestDTO = {
  orderItemId?: string | null;
  testId?: string | null;
  testCode?: string | null;
  testName: string;
  referenceRange?: string | null;
  unit?: string | null;
  price?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

export type AcceptLabTestsDTO = {
  tests: RequestedLabTestDTO[];
  notes?: string | null;
};

export type SaveLabTestResultDTO = {
  resultValue?: string;
  parameters?: Array<Record<string, unknown>>;
  resultNotes?: string;
  notes?: string;
  equipmentNotes?: string;
  resultFlag?: string;
};

export type LabDocumentMetadataDTO = {
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
};
