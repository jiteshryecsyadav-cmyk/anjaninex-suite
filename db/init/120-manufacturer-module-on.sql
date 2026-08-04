-- ============================================================================
-- 120: MFG firm ko manufacturer module apne aap mile
-- ============================================================================
-- Ambika Fashion ko MFG banaya, uska malik login bhi kar gaya — par har API
-- 403 de rahi thi aur screen par sirf "List nahi aa payi" dikh raha tha.
--
-- Wajah: [ModuleAccess("manufacturer")] firm ke enabled_modules me dekhta hai,
-- aur wahan `{}` bharaa tha. Yani firm ne wo module "khareeda" hi nahi.
-- Permission poori thi, phir bhi darwaza band tha — aur error me kuch nahi
-- likha aata (403 ka body khali hota hai), isliye pakadna mushkil tha.
--
-- Ab: jis firm ka dhandha manufacturer (ya both) hai, uske liye ye module
-- apne aap chalu. Nayi firms ke liye ye kaam CreateFirm karta hai.
-- ============================================================================

UPDATE platform.firms
   SET enabled_modules = COALESCE(enabled_modules, '{}'::jsonb)
                         || jsonb_build_object(
                              'manufacturer', true,
                              'sales',        true,
                              'purchase',     true,
                              'production',   true,
                              'stock',        true,
                              'masters',      true,
                              'reports',      true),
       updated_at = now()
 WHERE business_kind IN ('manufacturer', 'both');

DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM platform.firms
     WHERE business_kind IN ('manufacturer','both')
       AND enabled_modules @> '{"manufacturer": true}'::jsonb;
    RAISE NOTICE 'Manufacturer module chalu: % firm par', n;
END $$;

SELECT 'manufacturer module on ✓' AS status;
