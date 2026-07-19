-- =============================================================================
-- 88 — FOLD LESS ko Discount se ALAG karo
-- =============================================================================
-- Pehle frontend fold + saare discount ek hi `discount` column me bhej deta tha.
-- Do dikkat is se aati thi:
--   1) Sales disc % galat nikalta tha (fold bhi discount gina jata tha)
--   2) CD type = "after GST" me backend fold ka tax-factor lagata hi nahi tha,
--      jis se bill ka total screen aur DB me alag ho jata tha.
-- Ab fold alag column me store hoga; `discount` me sirf asli commercial discount.
-- =============================================================================

ALTER TABLE trading.bills ADD COLUMN IF NOT EXISTS fold_amt numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN trading.bills.fold_amt IS
  'Fold Less amount — gross me se discount se PEHLE ghata jata hai. discount column me shaamil NAHI hai (migration 88 ke baad).';
