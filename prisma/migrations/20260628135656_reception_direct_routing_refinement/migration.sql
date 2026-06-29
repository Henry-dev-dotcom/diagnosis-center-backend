-- Phase 8 reception workflow refinement
-- Adds safe, additive fields used by the walk-in registration and direct diagnostic queue routing APIs.

-- Patient / patients: walk-in tracking
ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "isWalkIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "walkInRegisteredById" TEXT;
ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "walkInRegisteredAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE IF EXISTS "patients" ADD COLUMN IF NOT EXISTS "isWalkIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "patients" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE IF EXISTS "patients" ADD COLUMN IF NOT EXISTS "walkInRegisteredById" TEXT;
ALTER TABLE IF EXISTS "patients" ADD COLUMN IF NOT EXISTS "walkInRegisteredAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "patients" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Order / orders: reception direct-routing metadata
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "requestType" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "requestedById" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "requestedByRole" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'ROUTINE';
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "urgency" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "clinicalNotes" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
ALTER TABLE IF EXISTS "Order" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "requestType" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "requestedById" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "requestedByRole" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'ROUTINE';
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "urgency" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "clinicalNotes" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
ALTER TABLE IF EXISTS "orders" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- OrderItem / order_items: item metadata used by lab/scan queue filters
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "serviceType" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "serviceCode" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "serviceName" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "testCode" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "testName" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "scanCode" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "scanName" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "referenceRange" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE IF EXISTS "OrderItem" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "serviceType" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "serviceCode" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "serviceName" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "testCode" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "testName" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "scanCode" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "scanName" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "referenceRange" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE IF EXISTS "order_items" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Useful indexes where the table names exist.
DO $$
BEGIN
  IF to_regclass('"Patient"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "Patient_facility_walkin_idx" ON "Patient" ("facilityId", "isWalkIn");
  END IF;

  IF to_regclass('"patients"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "patients_facility_walkin_idx" ON "patients" ("facilityId", "isWalkIn");
  END IF;

  IF to_regclass('"Order"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "Order_facility_source_type_status_idx" ON "Order" ("facilityId", "source", "requestType", "status");
  END IF;

  IF to_regclass('"orders"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "orders_facility_source_type_status_idx" ON "orders" ("facilityId", "source", "requestType", "status");
  END IF;
END $$;
