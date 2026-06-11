-- =============================================================================
-- Migration 20 — Duplicate protection: supplier_bill_no + unique constraints
-- =============================================================================
-- Purpose:
--   1. Bills: add supplier_bill_no column + UNIQUE constraint to prevent
--      accidental double-save of same bill (firm + supplier + their bill no + date)
--   2. Parties already have uq_contacts_firm_gst — verify it's enforced
-- =============================================================================

BEGIN;

-- ----------- 1. supplier_bill_no on bills -----------
ALTER TABLE trading.bills
  ADD COLUMN IF NOT EXISTS supplier_bill_no VARCHAR(50);

-- UNIQUE: same firm + same supplier + same supplier bill no + same date = duplicate
-- Allows null supplier_bill_no (legacy bills without one)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_supplier_bill_dup
  ON trading.bills(firm_id, party_id, supplier_bill_no, bill_date)
  WHERE supplier_bill_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bills_supplier_bill_no
  ON trading.bills(firm_id, supplier_bill_no)
  WHERE supplier_bill_no IS NOT NULL;

-- ----------- 2. Verify contacts GST uniqueness already enforced -----------
-- This was already created in 04-core.sql:
--   CONSTRAINT uq_contacts_firm_gst UNIQUE (firm_id, gst_number)
-- (no action needed — just documenting)

COMMIT;

SELECT 'migration 20-duplicate-protection complete' AS status;
