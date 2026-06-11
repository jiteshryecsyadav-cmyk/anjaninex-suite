-- ============================================================================
-- ⚠️ FINAL DEMO CLEANUP — bacha-khucha sab (Accounting + AI + Bot + Contacts)
-- Pehle CLEANUP-trading-demo.sql + CLEANUP-ad-hr-demo.sql chal chuke hain.
-- Ye script demo firm ka:
--   ✔ SAARE accounting vouchers + lines (manual bhi) delete karta hai
--   ✔ contact-linked ledgers (agar koi bache ho) delete karta hai
--   ✔ voucher/bill numbering counters reset karta hai (1 se shuru hogi)
--   ✔ AI scan logs + cache delete karta hai (scan count 0 ho jayega)
--   ✔ WhatsApp bot test data delete karta hai
--   ✔ firm ke bache hue demo contacts delete karta hai
-- SAFE rahega: logins (core.users), firm, branches, roles, chart of accounts
--   (heads/groups/sub-groups + system ledgers jaise Cash/Sales/GST), wallet,
--   subscription, Anjaninex Books firm ka data.
-- pgAdmin: pehle  ROLLBACK;  chalao, phir ye puri file Run (F5).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_firm uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';   -- Namokara demo firm
  t text;
BEGIN

  -- ---------- 1) Accounting: firm ke SAARE vouchers (manual + auto) ----------
  DELETE FROM accounting.voucher_lines WHERE voucher_id IN
    (SELECT id FROM accounting.vouchers WHERE firm_id = v_firm);
  DELETE FROM accounting.vouchers WHERE firm_id = v_firm;

  -- Contact-linked ledgers jo bache ho (system ledgers contact_id NULL — safe)
  DELETE FROM accounting.ledgers
   WHERE firm_id = v_firm AND contact_id IS NOT NULL;

  -- ---------- 2) Numbering counters reset (bill/voucher no 1 se) ----------
  IF to_regclass('platform.voucher_counters') IS NOT NULL THEN
    DELETE FROM platform.voucher_counters WHERE firm_id = v_firm;
  END IF;

  -- ---------- 3) AI scan logs + cache ----------
  IF to_regclass('ai.extraction_logs') IS NOT NULL THEN
    DELETE FROM ai.extraction_logs WHERE firm_id = v_firm;
  END IF;
  IF to_regclass('ai.cache') IS NOT NULL THEN
    DELETE FROM ai.cache WHERE firm_id = v_firm;
  END IF;

  -- ---------- 4) WhatsApp bot test data (firm-wise jahan column hai) ----------
  IF to_regclass('wa.orders') IS NOT NULL THEN
    EXECUTE 'DELETE FROM wa.orders';
  END IF;
  IF to_regclass('wa.forwards') IS NOT NULL THEN
    EXECUTE 'DELETE FROM wa.forwards';
  END IF;
  IF to_regclass('wa.qa_log') IS NOT NULL THEN
    EXECUTE 'DELETE FROM wa.qa_log';
  END IF;
  IF to_regclass('wa.conversations') IS NOT NULL THEN
    EXECUTE 'DELETE FROM wa.conversations';
  END IF;
  IF to_regclass('wa.incoming') IS NOT NULL THEN
    EXECUTE 'DELETE FROM wa.incoming';
  END IF;

  -- ---------- 5) Firm ke bache hue demo contacts ----------
  -- (saare profiles pehle hi delete ho chuke; jo contact ab kahin use nahi
  --  ho raha wo demo leftover hai)
  DELETE FROM core.contacts c
   WHERE c.firm_id = v_firm
     AND NOT EXISTS (SELECT 1 FROM trading.party_profiles      p WHERE p.contact_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM suppliers.supplier_profiles s WHERE s.contact_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM suppliers.buyer_profiles    b WHERE b.contact_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM hr.employee_profiles        e WHERE e.contact_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM accounting.ledgers          l WHERE l.contact_id = c.id);

END $$;

COMMIT;

-- ======================= VERIFY — pura suite khali? =======================
-- Sab 0 hone chahiye (sirf *_SAFE wale nahi)
SELECT
  (SELECT count(*) FROM core.contacts          WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS contacts,
  (SELECT count(*) FROM trading.party_profiles WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS parties,
  (SELECT count(*) FROM trading.items          WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS items,
  (SELECT count(*) FROM trading.orders         WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS orders,
  (SELECT count(*) FROM trading.bills          WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS bills,
  (SELECT count(*) FROM trading.payments       WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS payments,
  (SELECT count(*) FROM suppliers.supplier_profiles WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS ad_suppliers,
  (SELECT count(*) FROM suppliers.buyer_profiles    WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS ad_buyers,
  (SELECT count(*) FROM hr.employee_profiles        WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS hr_staff,
  (SELECT count(*) FROM accounting.vouchers         WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') AS vouchers,
  (SELECT count(*) FROM accounting.ledgers          WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND contact_id IS NOT NULL) AS party_ledgers,
  (SELECT count(*) FROM accounting.ledgers          WHERE firm_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND contact_id IS NULL) AS system_ledgers_SAFE,
  (SELECT count(*) FROM core.users) AS logins_SAFE;
