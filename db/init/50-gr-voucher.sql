-- ============================================================================
-- Migration 50 — Goods Return (GR) accounting voucher link
-- PROBLEM: GoodsReturnService.Create only saved the GR + lines; it posted NO
-- accounting voucher. So a GR never appeared in the party khata (ledger) and the
-- party balance stayed wrong (bill Dr never got the GR credit). Approve() only
-- folded the amount into bill.paid_amount — a *settlement* shortcut — but the
-- double-entry ledger never moved.
--
-- This migration adds voucher_id on trading.goods_returns so the service can
-- post / re-post / remove a balanced "sales_return" (or "purchase_return")
-- voucher that CREDITS the bill's party (the same party the bill debited) and
-- Dr's a Sales Return ledger — mirroring how trading.bills carries voucher_id.
--
-- Idempotent. EF maps via UseSnakeCaseNamingConvention() so VoucherId -> voucher_id.
-- ============================================================================

BEGIN;

ALTER TABLE trading.goods_returns
    ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES accounting.vouchers(id);

CREATE INDEX IF NOT EXISTS idx_gr_voucher
    ON trading.goods_returns(voucher_id) WHERE voucher_id IS NOT NULL;

COMMENT ON COLUMN trading.goods_returns.voucher_id IS
    'Accounting voucher (sales_return / purchase_return) auto-posted for this GR. '
    'Credits the bill party + Dr Sales Return ledger. Re-posted on Update, removed on delete/reject.';

COMMIT;

SELECT 'migration 50-gr-voucher complete' AS status;
