export type ReceptionDiagnosticRequestType = 'LAB' | 'SCAN';
export type ReceptionPriority = 'ROUTINE' | 'URGENT' | 'STAT';

export interface CreateWalkInPatientParams {
  facilityId: string;
  createdById: string;
  patient: Record<string, any>;
}

export interface CreateReceptionDiagnosticRequestParams {
  facilityId: string;
  patientId: string;
  requestedById: string;
  clinicianId?: string | null;
  requestType: ReceptionDiagnosticRequestType;
  priority?: string | null;
  clinicalNotes?: string | null;
  paymentStatus?: string | null;
  invoiceId?: string | null;
  items: Record<string, any>[];
}

export interface ReceptionSearchQuery {
  q?: unknown;
  status?: unknown;
  priority?: unknown;
  requestType?: unknown;
  from?: unknown;
  to?: unknown;
  take?: unknown;
  skip?: unknown;
}
