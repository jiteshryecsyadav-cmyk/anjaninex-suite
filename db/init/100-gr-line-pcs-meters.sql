-- ============================================================================
-- 100: GR lines me bhi PCS + METERS + rate-basis (bill/order jaisa — migration 97)
-- ============================================================================
-- Return bhi usi maal ka hota hai jo bill me PCS+METERS me likha tha. Ab GR
-- line par bhi dono ginti + kis par rate laga (qty = billing wali, purane
-- hisaab waise ke waise).

ALTER TABLE trading.goods_return_lines ADD COLUMN IF NOT EXISTS pcs        NUMERIC(12,3);
ALTER TABLE trading.goods_return_lines ADD COLUMN IF NOT EXISTS meters     NUMERIC(12,3);
ALTER TABLE trading.goods_return_lines ADD COLUMN IF NOT EXISTS rate_basis TEXT;   -- 'PCS' | 'MTR'

SELECT 'goods_return_lines: pcs + meters + rate_basis ready ✓' AS status;
