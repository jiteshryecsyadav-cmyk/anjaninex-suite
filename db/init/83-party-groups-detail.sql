-- 83: GROUP MASTER — group ki poori detail (owner, address, mobile, commission,
-- discounts, payment terms). Save par ye data group ki SAB sister firms me
-- auto-sync hota hai (contacts + party_profiles).

ALTER TABLE core.party_groups
    ADD COLUMN IF NOT EXISTS owner_name          text,
    ADD COLUMN IF NOT EXISTS address             text,
    ADD COLUMN IF NOT EXISTS mobile              text,
    ADD COLUMN IF NOT EXISTS whatsapp            text,
    ADD COLUMN IF NOT EXISTS city                text,
    ADD COLUMN IF NOT EXISTS pincode             text,
    ADD COLUMN IF NOT EXISTS state               text,
    ADD COLUMN IF NOT EXISTS commission          numeric(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_normal     numeric(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_exhibition numeric(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_special    numeric(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_terms       text;

SELECT 'party groups detail ✓' AS status;
