# Backend Walk-In Request Support

The backend already supports the reception walk-in request workflow through:

`POST /reception/walk-ins`

The request body accepts either a new patient payload or an existing patient ID plus requested catalog items. The service creates the order, confirms it, optionally creates an invoice, optionally creates a patient visit, and sends a billing notification.

No backend code change was required for the frontend walk-in request update.
