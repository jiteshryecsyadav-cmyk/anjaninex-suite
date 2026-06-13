-- =============================================================================
-- Migration 41 — Add E-Way Bill DATE to bills
-- =============================================================================
-- Purpose: Store the e-Way Bill generation date (parallel to eway_bill_no).
--          AI bill-scan fills this from labels like 'E-Way Bill Date'/'EWB Date'.
-- =============================================================================

BEGIN;

ALTER TABLE trading.bills ADD COLUMN IF NOT EXISTS eway_bill_date DATE;

COMMIT;

SELECT 'migration 41-bill-eway-date complete' AS status;
