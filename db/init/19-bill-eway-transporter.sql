-- =============================================================================
-- Migration 19 — Add E-Way Bill, Transporter ID, LR fields to bills
-- =============================================================================
-- Purpose: Track e-Way Bill, Transporter (by ID for fuzzy/GST match), LR no/date
--          Bill par AI scan se ye sab fill ho jate hain.
-- =============================================================================

BEGIN;

ALTER TABLE trading.bills
  ADD COLUMN IF NOT EXISTS eway_bill_no    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS transporter_id  UUID REFERENCES core.transporters(id),
  ADD COLUMN IF NOT EXISTS lr_no           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lr_date         DATE;

CREATE INDEX IF NOT EXISTS idx_bills_eway       ON trading.bills(firm_id, eway_bill_no) WHERE eway_bill_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_transporter ON trading.bills(firm_id, transporter_id) WHERE transporter_id IS NOT NULL;

COMMIT;

SELECT 'migration 19-bill-eway-transporter complete' AS status;
