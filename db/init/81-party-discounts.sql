-- 81: SUPPLIER MULTIPLE DISCOUNTS — normal / exhibition / special (%).
-- Party master me save hote hain, Order/Bill me chip se items ke discount me apply.

ALTER TABLE trading.party_profiles
    ADD COLUMN IF NOT EXISTS discount_normal     numeric(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_exhibition numeric(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_special    numeric(5,2) NOT NULL DEFAULT 0;

SELECT 'party discounts ✓' AS status;
