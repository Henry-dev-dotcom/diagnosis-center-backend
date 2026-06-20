# Backend Phase 4 — Authentication System

This phase adds the backend authentication foundation for the Diagnosis Center / SUNKWA platform.

## Implemented

- Password hashing with `bcryptjs`
- JWT access tokens
- JWT refresh tokens
- Refresh session persistence in PostgreSQL through `UserSession`
- Refresh token hashing before storage
- Login audit events
- Logout audit events
- Failed login audit events
- Refresh token reuse detection
- Current user endpoint
- Password change endpoint
- Role and permission middleware
- Price visibility helper
- Demo seed password hashes

## Auth endpoints

```txt
POST  /api/auth/login
POST  /api/auth/refresh
POST  /api/auth/logout
GET   /api/auth/me
PATCH /api/auth/change-password
```

## Demo credentials

```txt
admin     / admin123
doctor    / doctor123
reception / reception123
lab       / lab123
scan      / scan123
billing   / billing123
```

## Token model

Access token payload:

```json
{
  "sub": "user_id",
  "role": "ADMIN",
  "sessionId": "session_id",
  "type": "access"
}
```

Refresh token payload:

```json
{
  "sub": "user_id",
  "role": "ADMIN",
  "sessionId": "session_id",
  "type": "refresh"
}
```

Refresh tokens are hashed with SHA-256 before being stored in `UserSession.refreshToken`.

## Role middleware

```txt
requireAuth
requireRole(...roles)
requirePermission(permission)
```

## Important security behavior

- Suspended/inactive users cannot log in.
- Invalid credentials return a generic error.
- Refresh sessions can be revoked.
- Logout revokes the current session or the supplied refresh token session.
- Changing password revokes all current sessions.
- Unauthorized role/permission attempts are audit logged.

## Phase 4 QA

Run:

```bash
npm run qa
```

For deeper local validation after installing dependencies and starting PostgreSQL:

```bash
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Then test:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```
