-- ============================================================================
-- Migration 31 — Supplier rate range (bot registration me min/max rate)
-- Buyer ke paas budget_min/budget_max pehle se hai; supplier ke liye add.
-- ============================================================================

BEGIN;

ALTER TABLE suppliers.supplier_profiles ADD COLUMN IF NOT EXISTS rate_min NUMERIC(12,2);
ALTER TABLE suppliers.supplier_profiles ADD COLUMN IF NOT EXISTS rate_max NUMERIC(12,2);

COMMIT;

SELECT 'migration 31-supplier-rate-range complete' AS status;
