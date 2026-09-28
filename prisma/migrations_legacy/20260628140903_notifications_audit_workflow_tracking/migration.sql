-- Backend Phase 11: Notifications and Audit Log Workflow Tracking
-- PostgreSQL migration designed to be safe on existing databases.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS facility_workflow_events (
  id TEXT PRIMARY KEY DEFAULT ('wfe_' || gen_random_uuid()::text),
  facility_id TEXT NOT NULL,
  actor_id TEXT NULL,
  actor_role TEXT NULL,
  actor_ip TEXT NULL,
  actor_user_agent TEXT NULL,
  event_type TEXT NOT NULL,
  event_group TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  order_id TEXT NULL,
  patient_id TEXT NULL,
  clinician_id TEXT NULL,
  result_id TEXT NULL,
  document_id TEXT NULL,
  scan_id TEXT NULL,
  sample_id TEXT NULL,
  invoice_id TEXT NULL,
  payment_id TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_facility_created ON facility_workflow_events(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_type ON facility_workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_group ON facility_workflow_events(event_group);
CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_entity ON facility_workflow_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_order ON facility_workflow_events(order_id);
CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_patient ON facility_workflow_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_clinician ON facility_workflow_events(clinician_id);
CREATE INDEX IF NOT EXISTS idx_facility_workflow_events_result ON facility_workflow_events(result_id);

CREATE TABLE IF NOT EXISTS workflow_notification_delivery_logs (
  id TEXT PRIMARY KEY DEFAULT ('wnd_' || gen_random_uuid()::text),
  workflow_event_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  recipient_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipient_targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  channels JSONB NOT NULL DEFAULT '["IN_APP"]'::jsonb,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_notification_delivery_logs_event ON workflow_notification_delivery_logs(workflow_event_id);
CREATE INDEX IF NOT EXISTS idx_workflow_notification_delivery_logs_facility ON workflow_notification_delivery_logs(facility_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'facility_id') THEN
      ALTER TABLE notifications ADD COLUMN facility_id TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'workflow_event_id') THEN
      ALTER TABLE notifications ADD COLUMN workflow_event_id TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'event_type') THEN
      ALTER TABLE notifications ADD COLUMN event_type TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'event_group') THEN
      ALTER TABLE notifications ADD COLUMN event_group TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'severity') THEN
      ALTER TABLE notifications ADD COLUMN severity TEXT NOT NULL DEFAULT 'INFO';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'metadata') THEN
      ALTER TABLE notifications ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_notifications_facility_created ON notifications(facility_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_workflow_event ON notifications(workflow_event_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'facility_id') THEN
      ALTER TABLE audit_logs ADD COLUMN facility_id TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'workflow_event_id') THEN
      ALTER TABLE audit_logs ADD COLUMN workflow_event_id TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_type') THEN
      ALTER TABLE audit_logs ADD COLUMN entity_type TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_id') THEN
      ALTER TABLE audit_logs ADD COLUMN entity_id TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'metadata') THEN
      ALTER TABLE audit_logs ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_audit_logs_facility_created ON audit_logs(facility_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_workflow_event ON audit_logs(workflow_event_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
  END IF;
END $$;
