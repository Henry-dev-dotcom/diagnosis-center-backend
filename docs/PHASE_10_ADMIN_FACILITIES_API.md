# Phase 10: Admin Facilities Management API

This phase adds backend APIs for the Admin page where the platform owner can add and customize diagnostic facilities.

## Purpose

The system now supports multiple diagnostic facilities. Each facility can have its own:

- name, code, contact, address, status, and type
- branding colors and logo name
- enabled features
- active departments
- lab and scan catalog
- routing rules
- user assignments
- platform limits

## API base path

Register the routes as:

```ts
router.use('/admin/facilities', facilityManagementRoutes);
```

If your app mounts all routes under `/api`, the final path becomes:

```text
/api/admin/facilities
```

## Endpoints

```text
GET    /api/admin/facilities
POST   /api/admin/facilities
GET    /api/admin/facilities/:facilityId
PATCH  /api/admin/facilities/:facilityId
PATCH  /api/admin/facilities/:facilityId/status
PATCH  /api/admin/facilities/:facilityId/features
PATCH  /api/admin/facilities/:facilityId/departments
PATCH  /api/admin/facilities/:facilityId/catalog
PATCH  /api/admin/facilities/:facilityId/routing
PATCH  /api/admin/facilities/:facilityId/branding
PATCH  /api/admin/facilities/:facilityId/limits
POST   /api/admin/facilities/:facilityId/users
DELETE /api/admin/facilities/:facilityId/users/:assignmentId
```

## Access control

Only a Super Admin should be able to create and manage facilities. This package uses `requireSuperAdmin` inside the controller and integrates with the Phase 3 facility-scope middleware.

## Frontend mapping

The Admin Facilities page should call these APIs:

| Frontend action | Backend endpoint |
|---|---|
| Load facilities | `GET /api/admin/facilities` |
| Add facility | `POST /api/admin/facilities` |
| Edit facility profile | `PATCH /api/admin/facilities/:facilityId` |
| Enable/disable facility | `PATCH /api/admin/facilities/:facilityId/status` |
| Customize features | `PATCH /api/admin/facilities/:facilityId/features` |
| Customize departments | `PATCH /api/admin/facilities/:facilityId/departments` |
| Customize tests/scans | `PATCH /api/admin/facilities/:facilityId/catalog` |
| Customize result routing | `PATCH /api/admin/facilities/:facilityId/routing` |
| Customize branding | `PATCH /api/admin/facilities/:facilityId/branding` |
| Customize limits | `PATCH /api/admin/facilities/:facilityId/limits` |
| Assign users | `POST /api/admin/facilities/:facilityId/users` |

## Notes

This phase depends on:

- Phase 2 Prisma schema extension
- Phase 3 permission and facility scoping middleware

After applying this phase, run:

```bash
cd backend
npx prisma migrate dev --name admin_facilities_api
npx prisma generate
npm run build
```
