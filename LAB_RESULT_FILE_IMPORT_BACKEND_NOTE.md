# Lab Result File Import Backend Note

The backend already includes a lab result file compatibility endpoint:

```text
POST /lab/results/:id/files
```

Controller/service path:

```text
src/controllers/lab.controller.ts
src/services/lab.service.ts
src/routes/lab.routes.ts
```

The current Prisma schema does not yet include a dedicated `LabResultFile` table like `ScanResultFile`, so lab file uploads are currently processed as local/metadata records and audit-logged. A future production database migration can add a persistent `LabResultFile` model if permanent backend-side lab attachment rows are required.

Backend static QA passed:

```bash
npm ci --ignore-scripts
npm run qa
```
