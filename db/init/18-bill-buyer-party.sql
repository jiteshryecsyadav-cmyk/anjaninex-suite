-- =============================================================================
-- Migration 18 — Add buyer_party_id to trading.bills
-- =============================================================================
-- Purpose: Track BOTH supplier and buyer separately for commission-agent flow.
--
-- Convention going forward:
--   - bills.party_id      = SUPPLIER (jisne maal bheja — goods provider)
--   - bills.buyer_party_id = BUYER (jisne kharida — customer)
--
-- BACKWARD COMPAT:
--   - Existing SALES bills have party_id = buyer (legacy data). We don't rename
--     those automatically because that would break linked vouchers/payments.
--   - For NEW bills onwards, supplier + buyer are both stored properly.
--   - List API still falls back gracefully when buyer_party_id is null.
-- =============================================================================

BEGIN;

-- 1. Add the column (nullable — existing rows stay valid)
ALTER TABLE trading.bills
  ADD COLUMN IF NOT EXISTS buyer_party_id UUID
  REFERENCES trading.party_profiles(id);

-- 2. Index for fast lookups (e.g., "all bills where buyer = X")
CREATE INDEX IF NOT EXISTS idx_bills_buyer_party
  ON trading.bills(firm_id, buyer_party_id)
  WHERE buyer_party_id IS NOT NULL;

COMMIT;

SELECT 'migration 18-bill-buyer-party complete' AS status;
