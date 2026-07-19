-- SUPPLIER ka committed discount % (jaise 6%) — buyer ko pata nahi hota.
-- Bill me supplier jitna (jaise 3%) deta hai wo SALES disc; bacha hua
-- (purchase - sales) agency apni commission bill me recover karti hai.
-- Party pe set ho to wo, warna us supplier ke GROUP ka chalega.
ALTER TABLE core.contacts     ADD COLUMN IF NOT EXISTS purchase_disc_pct numeric(6,2);
ALTER TABLE core.party_groups ADD COLUMN IF NOT EXISTS purchase_disc_pct numeric(6,2);
