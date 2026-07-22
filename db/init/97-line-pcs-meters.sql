-- ============================================================================
-- 97: Bill/Order lines me PCS + METERS + rate-basis
-- ============================================================================
-- Textile bills par har item ki DO ginti hoti hai (Pcs 32 · Meters 224) aur
-- rate kabhi piece ka, kabhi meter ka. App me ek hi QTY thi — scan confuse
-- hota tha "kaunsi bharun?" aur doosri ginti ka record hi nahi rehta tha.
--
-- Ab dono save hoti hain + rate_basis batata hai kis par rate laga:
--     qty (purana column) = billing wali ginti (basis chuni hui) — isliye
--     saare purane reports/hisaab bina badle waise hi chalte rehte hain.
-- Purane bills me pcs/meters NULL rahenge — unme QTY hi dikhegi.

ALTER TABLE trading.bill_lines  ADD COLUMN IF NOT EXISTS pcs        NUMERIC(12,3);
ALTER TABLE trading.bill_lines  ADD COLUMN IF NOT EXISTS meters     NUMERIC(12,3);
ALTER TABLE trading.bill_lines  ADD COLUMN IF NOT EXISTS rate_basis TEXT;   -- 'PCS' | 'MTR'

ALTER TABLE trading.order_lines ADD COLUMN IF NOT EXISTS pcs        NUMERIC(12,3);
ALTER TABLE trading.order_lines ADD COLUMN IF NOT EXISTS meters     NUMERIC(12,3);
ALTER TABLE trading.order_lines ADD COLUMN IF NOT EXISTS rate_basis TEXT;

SELECT 'bill/order lines: pcs + meters + rate_basis ready ✓' AS status;
