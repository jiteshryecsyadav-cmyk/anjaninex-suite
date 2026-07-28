-- ============================================================================
-- 104: Bazaar Bot orders — AGENCY APPROVAL + Trading order ka jod
-- ============================================================================
-- Naya flow: buyer+supplier dono haan bolein to order 'pending_agency' hota hai.
-- Agency (Bazaar Link > Orders tab) APPROVE kare tabhi:
--   1. Trading me asli order banta hai (number ReserveCounter se)
--   2. Supplier ko "dispatch karo" ka message jata hai
-- Threads bhi yahin save — approval ke messages seedha sahi chat me jayein.

ALTER TABLE wa.orders
  ADD COLUMN IF NOT EXISTS buyer_thread_id    UUID,
  ADD COLUMN IF NOT EXISTS supplier_thread_id UUID,
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by        UUID,
  ADD COLUMN IF NOT EXISTS reject_reason      TEXT,
  ADD COLUMN IF NOT EXISTS trading_order_id   UUID,
  ADD COLUMN IF NOT EXISTS trading_order_no   TEXT;

-- status ab: pending_supplier | pending_agency | approved | rejected
SELECT 'bazaar agency approval ready ✓' AS status;
