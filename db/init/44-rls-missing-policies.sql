-- ============================================================================
-- 44-rls-missing-policies.sql
-- CRITICAL FIX: some tenant tables had ROW LEVEL SECURITY *enabled* but NO POLICY
-- defined (notably platform.voucher_counters — the document-number sequence table).
--
-- Postgres rule: a table with RLS enabled and ZERO policies is DEFAULT-DENY — every
-- read/write is blocked even when the tenant context (app.current_firm_id) is set
-- correctly. This silently broke EVERY document save (order/bill/voucher/payment/...)
-- because each one bumps platform.voucher_counters → 42501 "new row violates row-level
-- security policy".
--
-- This migration creates the STANDARD firm-isolation policy (same as 05-rls.sql /
-- 42-rls-seal-missing.sql) on every RLS-enabled table that has a firm_id column but is
-- missing a policy. Idempotent + safe to re-run.
-- ============================================================================

DO $$
DECLARE
    r   record;
    nm  text;
BEGIN
    FOR r IN
        SELECT n.nspname AS sch, c.relname AS tbl, c.oid AS oid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND c.relrowsecurity = true                       -- RLS is ON
          AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)  -- but NO policy
          AND EXISTS (SELECT 1 FROM pg_attribute a          -- and it has firm_id
                      WHERE a.attrelid = c.oid AND a.attname = 'firm_id' AND NOT a.attisdropped)
    LOOP
        nm := replace(r.sch || '_' || r.tbl, '.', '_');
        EXECUTE format($f$
            CREATE POLICY firm_isolation_%s ON %I.%I
              USING       (firm_id = core.current_firm_id()
                           OR current_setting('app.is_platform_admin', true) = 'true')
              WITH CHECK  (firm_id = core.current_firm_id()
                           OR current_setting('app.is_platform_admin', true) = 'true');
        $f$, nm, r.sch, r.tbl);
        RAISE NOTICE 'RLS policy created on %.% (was enabled but had no policy)', r.sch, r.tbl;
    END LOOP;
END $$;

-- Report any tables STILL RLS-enabled with no policy (e.g. tables without a firm_id
-- column) so they can be reviewed manually — these would be fully default-denied.
SELECT n.nspname || '.' || c.relname AS rls_on_but_no_policy_review
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
ORDER BY 1;

SELECT 'migration 44-rls-missing-policies complete' AS status;
