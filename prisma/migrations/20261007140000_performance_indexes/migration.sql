-- Composite indexes for the most common tenant-scoped list and queue filters.
CREATE INDEX "Patient_facilityId_createdAt_idx" ON "Patient"("facilityId", "createdAt");
CREATE INDEX "Order_facilityId_status_submittedAt_idx" ON "Order"("facilityId", "status", "submittedAt");
CREATE INDEX "Appointment_facilityId_status_scheduledDate_idx" ON "Appointment"("facilityId", "status", "scheduledDate");
CREATE INDEX "PatientVisit_facilityId_status_checkedInAt_idx" ON "PatientVisit"("facilityId", "status", "checkedInAt");
CREATE INDEX "LabSample_facilityId_status_acceptedAt_idx" ON "LabSample"("facilityId", "status", "acceptedAt");
CREATE INDEX "LabResult_facilityId_status_submittedAt_idx" ON "LabResult"("facilityId", "status", "submittedAt");
CREATE INDEX "Invoice_facilityId_status_createdAt_idx" ON "Invoice"("facilityId", "status", "createdAt");
CREATE INDEX "Notification_facilityId_isRead_createdAt_idx" ON "Notification"("facilityId", "isRead", "createdAt");
