import type { UserRole } from '@prisma/client';

export type AuthFacility = {
  id: string;
  code: string;
  name: string;
};

export type AuthUser = {
  id: string;
  /** null only for PLATFORM_ADMIN users, who belong to no facility. */
  facilityId: string | null;
  facility: AuthFacility | null;
  name: string;
  username: string;
  email?: string | null;
  role: UserRole;
  permissions: string[];
  sessionId: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
