-- 91: Party Master ke wo fields jo form me the par KAHIN SAVE HI NAHI HOTE THE.
-- Form me contactPerson/contactMobile/landline/rating/stars/avgPayDays/returnRate
-- bharte the, par save payload me ye bheje hi nahi jaate the aur contacts table me
-- inke column bhi nahi the -- yaani user bharta tha aur data chup-chaap gayab.
-- (FLAG / SPECIAL NOTE ke liye contacts.notes pehle se maujood hai — wahi use hoga.)

ALTER TABLE core.contacts
    ADD COLUMN IF NOT EXISTS contact_person   text,
    ADD COLUMN IF NOT EXISTS contact_mobile   text,
    ADD COLUMN IF NOT EXISTS landline         text,
    ADD COLUMN IF NOT EXISTS rating           text,
    ADD COLUMN IF NOT EXISTS stars            int,
    ADD COLUMN IF NOT EXISTS avg_pay_days     int,
    ADD COLUMN IF NOT EXISTS return_rate_pct  numeric(5,2);

SELECT 'party contact + rating fields ✓' AS status;
