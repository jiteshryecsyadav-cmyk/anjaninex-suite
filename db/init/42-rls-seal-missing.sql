-- ============================================================================
-- 42-rls-seal-missing.sql
-- SECURITY FIX: enable Row-Level Security + firm-isolation policy on tenant
-- tables that were missing RLS (cross-firm data leak). Pattern matches 05-rls.sql:
--   firm_id = core.current_firm_id()  (+ platform-admin escape for admin tooling)
-- Idempotent: safe to re-run.
-- ============================================================================

DO $$
DECLARE
    t   text;
    nm  text;
    tbls text[] := ARRAY[
        'core.transporters',
        'trading.goods_returns',
        'trading.commission_invoices',
        'platform.audit_logs',
        'platform.auto_recharge_rules',
        'platform.firm_addon_services',
        'platform.firm_api_keys',
        'platform.payment_requests',
        'platform.service_usage',
        'platform.trial_extensions'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        -- policy name (schema_table)
        nm := replace(t, '.', '_');

        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS firm_isolation_%s ON %s;', nm, t);
        EXECUTE format($f$
            CREATE POLICY firm_isolation_%s ON %s
              USING       (firm_id = core.current_firm_id()
                           OR current_setting('app.is_platform_admin', true) = 'true')
              WITH CHECK  (firm_id = core.current_firm_id()
                           OR current_setting('app.is_platform_admin', true) = 'true');
        $f$, nm, t);

        RAISE NOTICE 'RLS sealed: %', t;
    END LOOP;
END $$;

SELECT 'migration 42-rls-seal-missing complete' AS status;
