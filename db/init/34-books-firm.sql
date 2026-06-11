-- 34: Anjaninex ki apni accounting — "Books firm" designation
-- billing_settings me ek pointer: kaunsi firm Anjaninex ke khud ke books hai.
-- Payment approve hote hi us firm me income voucher auto-post hota hai.
ALTER TABLE platform.billing_settings ADD COLUMN IF NOT EXISTS books_firm_id uuid;
