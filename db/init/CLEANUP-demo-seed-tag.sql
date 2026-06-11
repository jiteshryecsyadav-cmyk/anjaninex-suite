-- ============================================================================
-- ⚠️ DEMO-SEED CLEANUP (tag-based) — AD ke 101 suppliers / 100 buyers
-- Ye records DEMO-seed-suppliers-buyers.sql se bane the aur contacts par
-- source_module = 'demo_seed' ka tag hai — firm koi bhi ho, tag se udenge.
-- SAFE: aapke khud ke banaye supplier/buyer (unka tag alag hota hai), logins,
--       firm, branches, COA, wallet.
-- pgAdmin: pehle  ROLLBACK;  chalao, phir ye puri file Run (F5).
-- ============================================================================

BEGIN;

DO $$
BEGIN

  -- 1) In demo contacts ke supplier catalogs (varieties + rates + photos)
  IF to_regclass('suppliers.variety_photos') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.variety_photos WHERE variety_id IN (
               SELECT v.id FROM suppliers.varieties v
               JOIN suppliers.supplier_profiles sp ON sp.id = v.supplier_id
               JOIN core.contacts c ON c.id = sp.contact_id
               WHERE c.source_module = ''demo_seed'')';
  END IF;
  IF to_regclass('suppliers.variety_rates') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.variety_rates WHERE variety_id IN (
               SELECT v.id FROM suppliers.varieties v
               JOIN suppliers.supplier_profiles sp ON sp.id = v.supplier_id
               JOIN core.contacts c ON c.id = sp.contact_id
               WHERE c.source_module = ''demo_seed'')';
  END IF;
  IF to_regclass('suppliers.varieties') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.varieties WHERE supplier_id IN (
               SELECT sp.id FROM suppliers.supplier_profiles sp
               JOIN core.contacts c ON c.id = sp.contact_id
               WHERE c.source_module = ''demo_seed'')';
  END IF;

  -- 2) Rates / photos (legacy tables)
  IF to_regclass('suppliers.rates') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.rates WHERE supplier_id IN (
               SELECT sp.id FROM suppliers.supplier_profiles sp
               JOIN core.contacts c ON c.id = sp.contact_id
               WHERE c.source_module = ''demo_seed'')';
  END IF;
  IF to_regclass('suppliers.photos') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.photos WHERE supplier_id IN (
               SELECT sp.id FROM suppliers.supplier_profiles sp
               JOIN core.contacts c ON c.id = sp.contact_id
               WHERE c.source_module = ''demo_seed'')';
  END IF;

  -- 3) Appointments jo in par bane ho
  IF to_regclass('suppliers.appointment_staff') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.appointment_staff WHERE appointment_id IN (
               SELECT a.id FROM suppliers.appointments a
               JOIN suppliers.supplier_profiles sp ON sp.id = a.supplier_id
               JOIN core.contacts c ON c.id = sp.contact_id
               WHERE c.source_module = ''demo_seed'')';
  END IF;
  IF to_regclass('suppliers.appointments') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.appointments WHERE supplier_id IN (
               SELECT sp.id FROM suppliers.supplier_profiles sp
               JOIN core.contacts c ON c.id = sp.contact_id
               WHERE c.source_module = ''demo_seed'')';
  END IF;

  -- 4) Profiles (supplier + buyer)
  DELETE FROM suppliers.supplier_profiles sp
   USING core.contacts c
   WHERE c.id = sp.contact_id AND c.source_module = 'demo_seed';

  DELETE FROM suppliers.buyer_profiles bp
   USING core.contacts c
   WHERE c.id = bp.contact_id AND c.source_module = 'demo_seed';

  -- 5) In contacts ke ledgers (agar bane ho) fir contacts khud
  DELETE FROM accounting.voucher_lines WHERE ledger_id IN
    (SELECT l.id FROM accounting.ledgers l
      JOIN core.contacts c ON c.id = l.contact_id
     WHERE c.source_module = 'demo_seed');
  DELETE FROM accounting.ledgers l
   USING core.contacts c
   WHERE c.id = l.contact_id AND c.source_module = 'demo_seed';

  DELETE FROM core.contacts WHERE source_module = 'demo_seed';

END $$;

COMMIT;

-- Verify — demo_seed sab 0, aapke apne banaye records bache rahenge
SELECT
  (SELECT count(*) FROM core.contacts WHERE source_module = 'demo_seed') AS demo_contacts,
  (SELECT count(*) FROM suppliers.supplier_profiles) AS ad_suppliers,
  (SELECT count(*) FROM suppliers.buyer_profiles)    AS ad_buyers,
  (SELECT count(*) FROM core.contacts)               AS total_contacts,
  (SELECT count(*) FROM core.users)                  AS logins_SAFE;
