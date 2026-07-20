-- 90: GROUP MASTER — Party Master jaise baaki fields bhi group par.
-- Maqsad: group me ek baar bharo -> sab sister firms me auto-sync (save par).
-- JAAN-BOOJH KAR NAHI liye: gstin, pan, udyam, msme, opening_balance, firm ka naam —
-- ye har firm ki apni pehchan/hisaab hain, group se thopna galat hoga.

ALTER TABLE core.party_groups
    -- trading.party_profiles me jaate hain
    ADD COLUMN IF NOT EXISTS credit_limit    numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS credit_days     int,
    -- core.contacts me jaate hain
    ADD COLUMN IF NOT EXISTS supplier_type   text,
    ADD COLUMN IF NOT EXISTS email           text,
    ADD COLUMN IF NOT EXISTS wa_buyer        text,
    ADD COLUMN IF NOT EXISTS wa_extra        text,
    ADD COLUMN IF NOT EXISTS wa_extra_role   text,
    ADD COLUMN IF NOT EXISTS sub_agent       text,
    ADD COLUMN IF NOT EXISTS sub_agent_pct   numeric(5,2),
    ADD COLUMN IF NOT EXISTS incentive_pct   numeric(5,2),
    ADD COLUMN IF NOT EXISTS agent_share_pct numeric(5,2);

SELECT 'group master more fields ✓' AS status;
