import type { UserRole } from '@prisma/client';

export type AuthUser = {
  id: string;
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
