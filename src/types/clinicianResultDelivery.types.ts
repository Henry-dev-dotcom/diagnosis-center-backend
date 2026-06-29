export type ClinicianResultSource = 'LAB' | 'SCAN' | 'MANUAL';
export type ClinicianResultDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'ARCHIVED';

export interface DeliverResultToClinicianParams {
  facilityId: string;
  clinicianId: string;
  patientId?: string | null;
  orderId?: string | null;
  acceptedSampleId?: string | null;
  scanAcceptedRequestId?: string | null;
  resultId?: string | null;
  source: ClinicianResultSource;
  priority?: string | null;
  title?: string | null;
  summary?: string | null;
  payload?: Record<string, any> | null;
  deliveredById: string;
}

export interface ClinicianInboxQuery {
  q?: unknown;
  status?: unknown;
  source?: unknown;
  priority?: unknown;
  patientId?: unknown;
  orderId?: unknown;
  from?: unknown;
  to?: unknown;
  take?: unknown;
  skip?: unknown;
}

export interface ResultReadStateParams {
  facilityId: string;
  inboxId: string;
  clinicianId: string;
  actorId: string;
}

export interface ResultArchiveStateParams extends ResultReadStateParams {
  archived?: boolean;
}
