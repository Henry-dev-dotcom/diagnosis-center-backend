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
  /** The facility-defined role in use, if any; its permissions replace the base role's. */
  customRole: { id: string; name: string } | null;
  /** Effective permissions (custom role or base role defaults). */
  permissions: string[];
  /** Module keys switched on for the user's facility; empty for platform users. */
  modules: string[];
  sessionId: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
