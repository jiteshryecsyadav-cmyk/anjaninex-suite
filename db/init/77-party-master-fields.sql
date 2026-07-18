-- 77: Party master ke naye fields — supplier type, buyer type, Udyam Aadhaar, MSME type,
-- aur ek extra WhatsApp (role ke saath: accountant/manager/staff).
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS supplier_type text;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS buyer_type    text;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS udyam_no      text;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS msme_type     text;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS wa_extra      text;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS wa_extra_role text;
