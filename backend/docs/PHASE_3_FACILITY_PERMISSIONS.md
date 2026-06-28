# Phase 3 Backend Update: Facility Permissions and Data Scoping

## Purpose

This phase adds the permission foundation needed for the system to operate as a multi-diagnostic-facility platform.

The main rule is:

```text
Every user should only access the facility data they are allowed to access.
```

## Files included

```text
backend/src/constants/roles.ts
backend/src/types/facility-request.types.ts
backend/src/utils/httpErrors.ts
backend/src/utils/facilityAccess.ts
backend/src/services/facilityScope.service.ts
backend/src/middleware/facilityScope.middleware.ts
backend/src/middleware/roleAccess.middleware.ts
backend/src/middleware/requireFeature.middleware.ts
backend/src/middleware/requireDepartment.middleware.ts
backend/src/middleware/owningClinician.middleware.ts
backend/src/routes/facilityProtected.routes.example.ts
backend/scripts/apply_phase3_facility_permissions_patch.sh
```

## New backend logic

### 1. Facility context detection

The middleware checks facility context from:

```text
req.params.facilityId
req.body.facilityId
req.query.facilityId
x-facility-id request header
req.user.facilityId
req.user.facilityIds
FacilityUserAssignment table
```

### 2. Super admin behavior

Super admin users can view all facility data unless a facility is explicitly selected.

### 3. Normal facility users

Normal users must have an active facility assignment.

Supported methods:

```text
user.facilityId
user.facilityIds
FacilityUserAssignment table
```

### 4. Feature and department checks

The backend can now prevent access if a facility has disabled a module.

Examples:

```text
laboratory
scanImaging
reception
clinicianPortal
billing
reports
notifications
```

Departments can also be checked:

```text
laboratory
radiology
reception
finance
admin
```

## How to apply to existing routes

Add these after your authentication middleware:

```ts
import { attachFacilityScope } from '../middleware/facilityScope.middleware';
import { requireFacilityFeature } from '../middleware/requireFeature.middleware';
import { requireFacilityDepartment } from '../middleware/requireDepartment.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { LAB_ROLES } from '../constants/roles';

router.use(authenticate);
router.use(attachFacilityScope);

router.use('/lab',
  requireAnyRole(LAB_ROLES),
  requireFacilityFeature('laboratory'),
  requireFacilityDepartment('laboratory')
);
```

## How to scope Prisma queries

Use this helper inside services/controllers:

```ts
import { applyFacilityScope } from '../utils/facilityAccess';

const where = applyFacilityScope({ status: 'REQUESTED' }, req);
const queue = await prisma.order.findMany({ where });
```

This turns into one of these automatically:

```ts
{ status: 'REQUESTED', facilityId: req.facilityId }
```

or:

```ts
{ status: 'REQUESTED', facilityId: { in: req.facilityIds } }
```

Super admin users are not restricted unless they explicitly select a facility.

## Route groups to update in your backend

Apply these route guards:

### Lab routes

```text
attachFacilityScope
requireAnyRole(LAB_ROLES)
requireFacilityFeature('laboratory')
requireFacilityDepartment('laboratory')
```

### Scan routes

```text
attachFacilityScope
requireAnyRole(SCAN_ROLES)
requireFacilityFeature('scanImaging')
```

### Reception routes

```text
attachFacilityScope
requireAnyRole(RECEPTION_ROLES)
requireFacilityFeature('reception')
```

### Clinician routes

```text
attachFacilityScope
requireAnyRole(CLINICIAN_ROLES)
requireFacilityFeature('clinicianPortal')
```

### Admin facility routes

```text
attachFacilityScope
requireAnyRole(FACILITY_ADMIN_ROLES)
```

## Important note

This phase adds reusable permission/scoping tools. The next backend phase should use these tools inside the actual workflow APIs for:

```text
Lab Queue
Accepted Samples
Lab Results
Scan Queue
Clinician Results
Reception Walk-ins
Admin Facilities
```
