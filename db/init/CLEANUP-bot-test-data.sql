-- ============================================================================
-- CLEANUP — Bot test data (OPTIONAL, soch-samajh kar chalao)
-- Testing ke purane photos/orders hatata hai. Sirf wa.* schema, baaki data safe.
-- pgAdmin me poora chala do (F5). Wapas nahi aayega.
-- ============================================================================

BEGIN;

-- 1) Forwards (broadcast log) — incoming pe depend karte hain, pehle.
DELETE FROM wa.forwards;

-- 2) Orders (bot ke buyer-supplier orders)
DELETE FROM wa.orders;

-- 3) Incoming photos (galat rate wali test rows + sab)
DELETE FROM wa.incoming;

-- 4) Chat states (adhure onboarding/order conversations)
DELETE FROM wa.conversations;

COMMIT;

SELECT 'bot test data cleared' AS status;

-- --------------------------------------------------------------------------
-- Agar sirf GALAT rate wali test rows hatani ho (sab nahi), upar wala mat
-- chalao — neeche wali 2 lines chalao:
--   DELETE FROM wa.incoming WHERE caption ILIKE '%pic%' OR caption ~ '\d+-\d+' OR caption IS NULL;
-- --------------------------------------------------------------------------
