-- ============================================================================
-- Migration 28 — Bot order pe broker commission (brokerage)
-- Namokara broker hai: har deal pe commission % + amount yahin capture hota hai.
-- ============================================================================

BEGIN;

ALTER TABLE wa.orders ADD COLUMN IF NOT EXISTS commission_pct    NUMERIC(5,2);
ALTER TABLE wa.orders ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(14,2);
ALTER TABLE wa.orders ADD COLUMN IF NOT EXISTS commission_at     TIMESTAMPTZ;

COMMIT;

SELECT 'migration 28-wa-order-commission complete' AS status;
