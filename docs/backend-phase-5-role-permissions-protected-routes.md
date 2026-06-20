# Backend Phase 5 — Role Permissions and Protected Route Structure

## Scope

Phase 5 adds the permission and protected-route foundation that will control all later module endpoints.

## Implemented

- Formal permission registry in `src/config/permissions.ts`
- Role-to-permission mapping for all six PRD roles
- Price visibility guard: only Admin, Receptionist, and Billing Staff can view prices
- Route access policy registry in `src/config/routeAccess.ts`
- Protected route groups for all major modules
- Access summary endpoint for the logged-in user
- Admin-only role matrix endpoint
- Resource-scope middleware foundations:
  - own-doctor resource guard
  - lab-only order item guard
  - scan-only order item guard
  - finance role guard
- Audit logging for role, permission, and scope denials
- Static QA check for Phase 5 structure

## Roles

- `ADMIN`
- `DOCTOR`
- `RECEPTIONIST`
- `LAB_STAFF`
- `SCAN_STAFF`
- `BILLING_STAFF`

## Protected module route groups

- `/api/access`
- `/api/users`
- `/api/patients`
- `/api/doctor`
- `/api/orders`
- `/api/reception`
- `/api/lab`
- `/api/scan`
- `/api/billing`
- `/api/finance`
- `/api/admin`
- `/api/results`
- `/api/reports`
- `/api/notifications`
- `/api/files`

## Important access rules

- Doctors can only access own doctor workflow resources.
- Lab staff can access lab workflow endpoints, not scan workflow endpoints.
- Scan staff can access scan/imaging workflow endpoints, not lab workflow endpoints.
- Billing staff can access finance/billing endpoints but cannot edit clinical results.
- Reception can see prices and handle check-in/results notices, but does not manage finance ledger.
- Only Admin has full access.

## Price visibility

Allowed:

- Admin
- Receptionist
- Billing Staff

Blocked:

- Doctor
- Lab Staff
- Scan Staff

## Testing

Run:

```bash
npm run qa
```

Expected result:

```text
Backend Phase 5 role permissions and protected route structure static check passed.
```

## Next phase

Backend Phase 6 should add concrete route validators, endpoint contracts, and initial controller/service implementations for the route skeletons.
