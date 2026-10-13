-- Store private interdepartment conversations separately from shared and role-limited channels.
ALTER TABLE "StaffMessage"
  ADD COLUMN "senderDepartment" TEXT,
  ADD COLUMN "recipientDepartment" TEXT;

CREATE INDEX "StaffMessage_direct_sender_idx"
  ON "StaffMessage"("facilityId", "senderDepartment", "recipientDepartment", "expiresAt");

CREATE INDEX "StaffMessage_direct_recipient_idx"
  ON "StaffMessage"("facilityId", "recipientDepartment", "senderDepartment", "expiresAt");
