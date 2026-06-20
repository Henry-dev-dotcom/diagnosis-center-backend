# Frontend Live API Integration Contract

## Frontend service boundary

The frontend should connect to the backend through the service files under `src/services/` and should avoid direct API calls inside page components.

Core service modules:

```txt
authService
patientService
doctorService
orderService
receptionService through page actions/service calls
labService
scanService
billingService
financeService
adminService
resultService
reportService
notificationService
fileService
```

## Required environment

```txt
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:5000/api
VITE_API_TIMEOUT_MS=15000
```

## Authentication contract

`POST /api/auth/login` returns a standard API envelope containing:

```txt
user
accessToken
refreshToken
```

The frontend stores the tokens and sends:

```txt
Authorization: Bearer <accessToken>
```

for protected endpoints.

## Backend response envelope

Success responses use:

```json
{
  "success": true,
  "message": "Request completed",
  "data": {}
}
```

The frontend live API client should unwrap `data` for page/service consumers while still preserving error details in `ApiError`.

## Route-contract source of truth

Authenticated users can retrieve backend route contracts from:

```txt
GET /api/access/route-contracts
```

That endpoint is the backend source of truth for final frontend mapping verification.
