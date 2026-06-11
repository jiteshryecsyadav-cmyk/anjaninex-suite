-- ============================================================================
-- ⚠️ FULL DEMO CLEANUP (Trading + AD + HR) — bulletproof version
-- Jo table DB me exist nahi karti, use chupchaap SKIP kar deta hai.
-- DELETE: trading transactions+items+parties, AD suppliers/buyers+varieties,
--         appointments, HR staff+attendance/leave/payroll, in sab ke contacts+ledgers
-- SAFE:   logins (core.users), firm, branches, roles, chart of accounts, wallet
-- pgAdmin: pehle  ROLLBACK;  chalao, phir ye puri file Run (F5).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_firm uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  t text;
BEGIN

  -- ---------- helper-style: firm_id wale tables (exist ho to hi delete) ----------
  FOREACH t IN ARRAY ARRAY[
    'trading.commission_invoices',
    'trading.commission',
    'trading.payments',
    'trading.goods_returns',
    'trading.gr',
    'trading.bills',
    'trading.orders',
    'trading.items',
    'suppliers.rates',
    'suppliers.photos',
    'hr.payroll_records',
    'hr.selfies',
    'hr.attendance_logs',
    'hr.location_trails'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM %s WHERE firm_id = $1', t) USING v_firm;
    END IF;
  END LOOP;

  -- ---------- subquery wale (guarded) ----------
  IF to_regclass('suppliers.appointment_staff') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.appointment_staff WHERE appointment_id IN
             (SELECT id FROM suppliers.appointments WHERE firm_id = $1)' USING v_firm;
  END IF;
  IF to_regclass('suppliers.appointments') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.appointments WHERE firm_id = $1' USING v_firm;
  END IF;
  IF to_regclass('suppliers.varieties') IS NOT NULL THEN
    EXECUTE 'DELETE FROM suppliers.variety_photos WHERE variety_id IN (SELECT id FROM suppliers.varieties WHERE firm_id = $1)' USING v_firm;
    EXECUTE 'DELETE FROM suppliers.variety_rates  WHERE variety_id IN (SELECT id FROM suppliers.varieties WHERE firm_id = $1)' USING v_firm;
    EXECUTE 'DELETE FROM suppliers.varieties      WHERE firm_id = $1' USING v_firm;
  END IF;
  IF to_regclass('hr.leave_requests') IS NOT NULL THEN
    EXECUTE 'DELETE FROM hr.leave_requests WHERE employee_id IN (SELECT id FROM hr.employee_profiles WHERE firm_id = $1)' USING v_firm;
  END IF;
  IF to_regclass('hr.leave_balances') IS NOT NULL THEN
    EXECUTE 'DELETE FROM hr.leave_balances WHERE employee_id IN (SELECT id FROM hr.employee_profiles WHERE firm_id = $1)' USING v_firm;
  END IF;

  -- ---------- trading se bane vouchers ----------
  DELETE FROM accounting.voucher_lines WHERE voucher_id IN
    (SELECT id FROM accounting.vouchers WHERE firm_id = v_firm AND source_module = 'trading');
  DELETE FROM accounting.vouchers WHERE firm_id = v_firm AND source_module = 'trading';

  -- ---------- contacts pakdo (profiles delete hone se PEHLE) ----------
  CREATE TEMP TABLE _all_contacts AS
    SELECT contact_id FROM trading.party_profiles      WHERE firm_id = v_firm
    UNION SELECT contact_id FROM suppliers.supplier_profiles WHERE firm_id = v_firm
    UNION SELECT contact_id FROM suppliers.buyer_profiles    WHERE firm_id = v_firm
    UNION SELECT contact_id FROM hr.employee_profiles        WHERE firm_id = v_firm;

  -- ---------- profiles delete ----------
  DELETE FROM trading.party_profiles       WHERE firm_id = v_firm;
  DELETE FROM suppliers.buyer_profiles     WHERE firm_id = v_firm;
  DELETE FROM suppliers.supplier_profiles  WHERE firm_id = v_firm;
  DELETE FROM hr.employee_profiles         WHERE firm_id = v_firm;

  -- ---------- in contacts ke ledgers (FK) fir contacts ----------
  DELETE FROM accounting.voucher_lines WHERE ledger_id IN
    (SELECT id FROM accounting.ledgers WHERE contact_id IN (SELECT contact_id FROM _all_contacts));
  DELETE FROM accounting.ledgers WHERE contact_id IN (SELECT contact_id FROM _all_contacts);

  DELETE FROM core.contacts WHERE firm_id = v_firm AND id IN (SELECT contact_id FROM _all_contacts);

  DROP TABLE _all_contacts;

END $$;

COMMIT;

-- Verify (sirf pakki maujood tables) — sab 0, logins safe
SELECT
  (SELECT count(*) FROM trading.party_profiles)      AS parties,
  (SELECT count(*) FROM trading.bills)               AS bills,
  (SELECT count(*) FROM trading.orders)              AS orders,
  (SELECT count(*) FROM suppliers.supplier_profiles) AS ad_suppliers,
  (SELECT count(*) FROM suppliers.buyer_profiles)    AS ad_buyers,
  (SELECT count(*) FROM hr.employee_profiles)        AS hr_staff,
  (SELECT count(*) FROM core.contacts)               AS contacts_bache,
  (SELECT count(*) FROM core.users)                  AS logins_SAFE;
