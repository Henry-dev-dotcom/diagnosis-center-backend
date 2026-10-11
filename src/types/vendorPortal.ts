import type { Request } from 'express';

type VendorPartnerSummary = {
  id: string;
  code: string;
  name: string;
  contactPhone: string | null;
};

export type AuthenticatedVendor = {
  id: string;
  partnerId: string;
  fullName: string;
  email: string;
  sessionId: string;
  partner: VendorPartnerSummary;
};

declare module 'express-serve-static-core' {
  interface Request {
    vendorUser?: AuthenticatedVendor;
  }
}

export type VendorRequestContext = Pick<Request, 'ip' | 'get'>;
