-- =================================================
-- ORDERS: extra columns for new Order Add form
-- Adds: buyer_party_id, cd_percent, cd_amount,
--       supplier_order_no, payment_terms
-- =================================================

ALTER TABLE trading.orders
    ADD COLUMN IF NOT EXISTS buyer_party_id     UUID REFERENCES trading.party_profiles(id),
    ADD COLUMN IF NOT EXISTS cd_percent         NUMERIC(5,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cd_amount          NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS supplier_order_no  TEXT,
    ADD COLUMN IF NOT EXISTS payment_terms      TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON trading.orders(buyer_party_id)
    WHERE buyer_party_id IS NOT NULL;

-- =================================================
-- ORDER_LINES: extra columns to match new form
-- Adds: description, rd, sgst_pct, cgst_pct, tax_amount
-- =================================================

ALTER TABLE trading.order_lines
    ADD COLUMN IF NOT EXISTS description  TEXT,
    ADD COLUMN IF NOT EXISTS rd           NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sgst_pct     NUMERIC(5,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cgst_pct     NUMERIC(5,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount   NUMERIC(14,2) DEFAULT 0;

-- Backfill sgst_pct + cgst_pct from existing tax_rate (split equally)
UPDATE trading.order_lines
SET sgst_pct = COALESCE(tax_rate, 0) / 2.0,
    cgst_pct = COALESCE(tax_rate, 0) / 2.0
WHERE (sgst_pct IS NULL OR sgst_pct = 0)
  AND (cgst_pct IS NULL OR cgst_pct = 0);

-- Compute tax_amount from existing data where missing
UPDATE trading.order_lines
SET tax_amount = total_amount - taxable_amount
WHERE tax_amount IS NULL OR tax_amount = 0;

COMMENT ON TABLE trading.orders IS 'Sales/Purchase orders. CD = Cash Discount applied at order level.';
COMMENT ON COLUMN trading.orders.buyer_party_id IS 'For purchase orders where we have a different buyer (e.g., end customer for triangular deals)';
COMMENT ON COLUMN trading.order_lines.rd IS 'Rate discount per unit (subtracted from rate before taxable calc)';
