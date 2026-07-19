-- =============================================================================
-- 89 — COMMISSION BILL me DISC RECOVERY store karo
-- =============================================================================
-- Supplier 6% commit karta hai, buyer ko bill me sirf 3% deta hai.
-- Bacha hua 3% agency commission bill me claim karti hai.
-- Ye amount screen par dikhta aur print hota tha, par DB me kahin save NAHI hota tha —
-- yaani total_amount me se gayab tha aur kisi report/ledger me nahi aata tha.
-- =============================================================================

ALTER TABLE trading.commission_invoices
  ADD COLUMN IF NOT EXISTS disc_recovery_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE trading.commission_invoice_lines
  ADD COLUMN IF NOT EXISTS bal_disc_pct numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disc_amount  numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN trading.commission_invoices.disc_recovery_amount IS
  'Supplier se recover karne wala bacha hua discount (purchase disc − sales disc). total_amount me shaamil hai.';
COMMENT ON COLUMN trading.commission_invoice_lines.bal_disc_pct IS
  'Us bill ka balance disc % = purchase disc % − sales disc %.';
COMMENT ON COLUMN trading.commission_invoice_lines.disc_amount IS
  'Us bill par recoverable rupees = base amount × bal_disc_pct / 100.';
