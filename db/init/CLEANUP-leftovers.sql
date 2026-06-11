-- ============================================================================
-- ⚠️ LEFTOVERS CLEANUP — Scan Report + Activity Log + Cash/Bank opening
-- Ye script demo firm ka:
--   ✔ AI scan logs + cache (Scan Report 54 → 0)
--   ✔ Activity/Audit log ki saari purani entries
--   ✔ Ledgers ke DEMO opening balance (Cash ₹10,000 / Bank ₹75,000 → ₹0)
-- SAFE: logins, firm, branches, chart of accounts (ledgers rehenge, sirf
--       opening 0 hoga), wallet balance.
-- pgAdmin: pehle  ROLLBACK;  chalao, phir ye puri file Run (F5).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_firm uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';   -- Namokara demo firm
BEGIN

  -- 1) AI scan logs + cache (Scan Report)
  IF to_regclass('ai.extraction_logs') IS NOT NULL THEN
    DELETE FROM ai.extraction_logs WHERE firm_id = v_firm;
  END IF;
  IF to_regclass('ai.cache') IS NOT NULL THEN
    DELETE FROM ai.cache WHERE firm_id = v_firm;
  END IF;

  -- 2) Activity / Audit log — saari purani entries
  IF to_regclass('platform.audit_logs') IS NOT NULL THEN
    DELETE FROM platform.audit_logs WHERE firm_id = v_firm OR firm_id IS NULL;
  END IF;

  -- 3) Demo opening balances → 0 (Cash in Hand, Bank, sab ledgers)
  UPDATE accounting.ledgers
     SET opening_balance = 0
   WHERE firm_id = v_firm
     AND opening_balance <> 0;

END $$;

COMMIT;

-- ======================= VERIFY — sab 0? =======================
SELECT
  (SELECT count(*) FROM ai.extraction_logs WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS scan_logs,
  (SELECT count(*) FROM platform.audit_logs WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS audit_logs,
  (SELECT count(*) FROM accounting.ledgers
    WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND opening_balance <> 0) AS ledgers_with_opening,
  (SELECT count(*) FROM core.users) AS logins_SAFE;
