# Phase 14 Final Workflow QA Checklist

Use this checklist after applying all backend phases and the latest frontend patches.

## 1. Build and migration checks

- [ ] `npx prisma migrate dev` has been run for all migration phases.
- [ ] `npx prisma generate` completes successfully.
- [ ] `npm run build` completes successfully.
- [ ] `npx tsx scripts/phase14_route_integrity_check.ts` passes.
- [ ] `GET /api/admin/workflow-readiness/database` reports all required tables as present.

## 2. Admin facilities workflow

- [ ] Super Admin can create a new diagnostic facility.
- [ ] Super Admin can edit facility details.
- [ ] Super Admin can activate/suspend/disable a facility.
- [ ] Facility features can be enabled and disabled.
- [ ] Facility departments can be customized.
- [ ] Facility lab/scan service catalog can be customized.
- [ ] Facility branding and limits can be saved.
- [ ] Facility users can be assigned and removed.
- [ ] Facility workflow events are created after changes.

## 3. Facility scoping and permissions

- [ ] Users only see data for their assigned facility.
- [ ] Lab staff cannot access scan-only routes unless their role allows it.
- [ ] Scan staff cannot access lab-only routes unless their role allows it.
- [ ] Clinicians only see results delivered to them or permitted by facility rules.
- [ ] Receptionists cannot push final diagnostic results.
- [ ] Facility Admin cannot manage records outside assigned facility.
- [ ] Super Admin can view/manage all facilities.

## 4. Clinician request workflow

- [ ] Clinician can create new lab/scan request.
- [ ] Test search returns dropdown options under the search field.
- [ ] Submitted lab request appears in Lab Queue.
- [ ] Submitted scan request appears in Scan Queue.
- [ ] Request is facility-scoped correctly.

## 5. Reception walk-in workflow

- [ ] Reception can create walk-in patient.
- [ ] Reception can request lab tests for walk-ins.
- [ ] Reception can request scans for walk-ins.
- [ ] Lab request routes directly to Lab Queue.
- [ ] Scan request routes directly to Scan Queue.
- [ ] Reception can view/print reference copies only.

## 6. Laboratory Queue workflow

- [ ] Lab Queue shows only pending lab requests.
- [ ] Search works by patient name, patient ID, order ID, and test name.
- [ ] Add Test opens same-section window.
- [ ] Only requested tests are displayed.
- [ ] Lab staff can select accepted tests.
- [ ] Sample type is not required.
- [ ] Accept & Done moves only selected tests to Accepted Samples.
- [ ] Original queue item cannot be accepted twice.

## 7. Accepted Samples workflow

- [ ] Accepted Samples shows accepted patients only.
- [ ] Search works by patient name, patient ID, order ID, sample ID, and test name.
- [ ] Enter Results opens same-section result workspace.
- [ ] Only accepted tests appear in the patient result workspace.
- [ ] Each test opens result-entry popup.
- [ ] Popup appears above header/sidebar.
- [ ] Popup fields are vertically arranged.
- [ ] Add Document works inside the popup.
- [ ] Each uploaded document is linked to the correct test.
- [ ] Completed tests are marked completed one-by-one.
- [ ] Push to clinician is disabled until all accepted tests are completed.

## 8. Lab Results archive

- [ ] Pushed lab results appear in Results section.
- [ ] Result archive shows patient, clinician, order, tests, values, flags, and documents.
- [ ] Sent results cannot be edited from Accepted Samples.
- [ ] Documents cannot be removed after result delivery.

## 9. Scan workflow

- [ ] Scan Queue shows only scan/imaging requests.
- [ ] Review/Accept opens same-section workflow.
- [ ] Accepted scan request moves to Accepted Scans.
- [ ] Scan result/finding can be entered.
- [ ] Scan document/image can be uploaded.
- [ ] Completed scan result can be pushed directly to clinician.
- [ ] Sent scan result appears in scan results archive.

## 10. Clinician result delivery

- [ ] Lab result delivery creates clinician inbox item.
- [ ] Scan result delivery creates clinician inbox item.
- [ ] Clinician can open result details.
- [ ] Clinician can view uploaded documents.
- [ ] Clinician can mark result as read.
- [ ] Clinician can archive result.
- [ ] Notifications are created for delivered results.

## 11. Notifications and audit logs

- [ ] Facility changes create workflow event records.
- [ ] Lab accept/sample/result/document actions create audit/workflow records.
- [ ] Scan accept/result/document actions create audit/workflow records.
- [ ] Result delivery creates audit/workflow records.
- [ ] Blocked security actions are logged.

## 12. Phone and tablet API compatibility

- [ ] Queue card endpoints return compact summary data.
- [ ] Accepted Samples endpoint returns data needed by compact mobile cards.
- [ ] Long test names and documents are returned as arrays, not forced table-only data.
- [ ] Popup document endpoint works on mobile uploads.
