-- ============================================================================
-- 124: MFG firm ko HR, Bazaar Link aur Online Dukan bhi mile
-- ============================================================================
-- Manufacturer app me ab wahi screen laga di hain jo agency me hain — Wallet,
-- Plans, CREDIL, Party Chat, Complaint Box, HR, Bazaar Link, Online Dukan.
--
-- Par teen module `[ModuleAccess]` se bandhe hain aur MFG firm ke
-- enabled_modules me the hi nahi (migration 120 ne sirf manufacturer wale
-- daale the). Nateeja: screen khulti, andar sab 403 — aur 403 ka body khali
-- hota hai, isliye user ko sirf "List nahi aa payi" dikhta.
--
--   hr                — staff, hazri, chhutti, payroll
--   active_directory  — Bazaar Link (supplier/buyer directory, appointments)
--   online_dukan      — apni online dukan
--
-- Wallet / Plans / CREDIL / Party Chat / Complaint Box module-gated nahi hain
-- (wo firm-level hain, kisi bhi firm ko chalte hain) — isliye yahan nahi.
--
-- ⚠️ Ye sirf DARWAZA kholta hai. Plan me ye module hain ya nahi, uska hisaab
-- subscription alag se dekhti hai — wahan haath nahi lagaya.
-- ============================================================================

UPDATE platform.firms
   SET enabled_modules = COALESCE(enabled_modules, '{}'::jsonb)
                         || jsonb_build_object(
                              'hr',               true,
                              'active_directory', true,
                              'online_dukan',     true),
       updated_at = now()
 WHERE business_kind IN ('manufacturer', 'both');

DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM platform.firms
     WHERE business_kind IN ('manufacturer','both')
       AND enabled_modules @> '{"hr": true, "active_directory": true, "online_dukan": true}'::jsonb;
    RAISE NOTICE 'HR + Bazaar Link + Dukan chalu: % firm par', n;
END $$;

SELECT 'mfg shared modules on ✓' AS status;
