-- ============================================================================
-- 45-clean-hr-demo.sql
-- Remove DEMO/seed HR data (sample employees + their activity) from ALL firms.
-- HR was never enabled for live firms, so any HR people/activity rows are demo.
-- KEEPS config so HR stays functional: attendance_policies, holidays, salary_structures.
-- KEEPS logins (core.users), firms, branches, roles, chart of accounts, wallet.
-- Run as the postgres superuser (RLS bypassed for cleanup). Idempotent.
-- ============================================================================

BEGIN;

-- before counts
SELECT 'BEFORE' AS when,
  (SELECT count(*) FROM hr.employee_profiles) AS employees,
  (SELECT count(*) FROM hr.attendance_logs)   AS attendance,
  (SELECT count(*) FROM hr.leave_balances)    AS leave_bal,
  (SELECT count(*) FROM hr.payroll_records)   AS payroll;

DO $$
DECLARE t text;
BEGIN
  -- 1. child activity tables (delete first — FK safety)
  FOREACH t IN ARRAY ARRAY[
    'hr.location_trails',
    'hr.selfies',
    'hr.attendance_logs',
    'hr.payroll_records'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN EXECUTE format('DELETE FROM %s', t); END IF;
  END LOOP;

  IF to_regclass('hr.leave_requests') IS NOT NULL THEN DELETE FROM hr.leave_requests; END IF;
  IF to_regclass('hr.leave_balances') IS NOT NULL THEN DELETE FROM hr.leave_balances; END IF;

  -- 2. employees + their contacts/ledgers (NOT logins)
  IF to_regclass('hr.employee_profiles') IS NOT NULL THEN
    CREATE TEMP TABLE _emp_contacts AS
      SELECT contact_id FROM hr.employee_profiles WHERE contact_id IS NOT NULL;

    DELETE FROM hr.employee_profiles;

    DELETE FROM accounting.voucher_lines WHERE ledger_id IN
      (SELECT id FROM accounting.ledgers WHERE contact_id IN (SELECT contact_id FROM _emp_contacts));
    DELETE FROM accounting.ledgers WHERE contact_id IN (SELECT contact_id FROM _emp_contacts);
    DELETE FROM core.contacts WHERE id IN (SELECT contact_id FROM _emp_contacts);

    DROP TABLE _emp_contacts;
  END IF;
END $$;

COMMIT;

-- after counts (employees/attendance/payroll = 0; config + logins safe)
SELECT 'AFTER' AS when,
  (SELECT count(*) FROM hr.employee_profiles)   AS employees,
  (SELECT count(*) FROM hr.attendance_logs)     AS attendance,
  (SELECT count(*) FROM hr.leave_balances)      AS leave_bal,
  (SELECT count(*) FROM hr.payroll_records)     AS payroll,
  (SELECT count(*) FROM hr.attendance_policies) AS policies_KEPT,
  (SELECT count(*) FROM hr.holidays)            AS holidays_KEPT,
  (SELECT count(*) FROM core.users)             AS logins_SAFE;
