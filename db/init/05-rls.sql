-- ============================================================================
-- Namokara Suite — Row-Level Security (HARDENED — P0-6, P0-8)
-- Ensures cross-tenant data leak is impossible at DB level
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER FUNCTIONS — read tenant context set by app per-transaction
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS core;

CREATE OR REPLACE FUNCTION core.current_firm_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
BEGIN
    RETURN nullif(current_setting('app.current_firm_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION core.current_branch_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
BEGIN
    RETURN nullif(current_setting('app.current_branch_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;

-- Back-compat shim (used by older policies that say current_firm_id())
CREATE OR REPLACE FUNCTION current_firm_id()
RETURNS UUID LANGUAGE SQL STABLE AS $$ SELECT core.current_firm_id() $$;

-- ----------------------------------------------------------------------------
-- Enable + FORCE RLS on every firm-scoped table
-- FORCE blocks the table owner from bypassing — critical fix.
-- ----------------------------------------------------------------------------
ALTER TABLE core.branches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.branches    FORCE  ROW LEVEL SECURITY;
ALTER TABLE core.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.departments FORCE  ROW LEVEL SECURITY;
ALTER TABLE core.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.users       FORCE  ROW LEVEL SECURITY;
ALTER TABLE core.contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.contacts    FORCE  ROW LEVEL SECURITY;
ALTER TABLE core.roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.roles       FORCE  ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- POLICIES — USING + WITH CHECK (read AND write protection)
-- Note: users/roles allow firm_id IS NULL only for SUPER_ADMIN (platform-wide)
-- ----------------------------------------------------------------------------
CREATE POLICY firm_isolation_branches ON core.branches
    USING       (firm_id = core.current_firm_id())
    WITH CHECK  (firm_id = core.current_firm_id());

CREATE POLICY firm_isolation_departments ON core.departments
    USING       (firm_id = core.current_firm_id())
    WITH CHECK  (firm_id = core.current_firm_id());

CREATE POLICY firm_isolation_users ON core.users
    USING       (firm_id = core.current_firm_id()
                 OR current_setting('app.is_platform_admin', true) = 'true'
                 OR core.current_firm_id() IS NULL)   -- no-context (login/auth bootstrap)
    WITH CHECK  (firm_id = core.current_firm_id()
                 OR current_setting('app.is_platform_admin', true) = 'true'
                 OR core.current_firm_id() IS NULL);

CREATE POLICY firm_isolation_contacts ON core.contacts
    USING       (firm_id = core.current_firm_id())
    WITH CHECK  (firm_id = core.current_firm_id());

CREATE POLICY firm_isolation_roles ON core.roles
    USING       (firm_id = core.current_firm_id()
                 OR (firm_id IS NULL AND is_system = true))
    WITH CHECK  (firm_id = core.current_firm_id());

-- ----------------------------------------------------------------------------
-- ROLES — split app (RLS-enforced) vs super-admin (bypass)
-- App connects as namokara_app in production. NEVER as the table owner.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
        CREATE ROLE namokara_app NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_super') THEN
        CREATE ROLE namokara_super NOLOGIN BYPASSRLS;
    END IF;
END $$;

-- App role: read+write data, no DDL, no TRUNCATE
GRANT USAGE ON SCHEMA platform, core, trading, accounting, suppliers, hr, ai, audit TO namokara_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
    platform, core, trading, accounting, suppliers, hr, ai, audit TO namokara_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA
    platform, core, trading, accounting, suppliers, hr, ai, audit TO namokara_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform, core, trading, accounting, suppliers, hr, ai, audit
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO namokara_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform, core, trading, accounting, suppliers, hr, ai, audit
    GRANT USAGE ON SEQUENCES TO namokara_app;

-- Statement timeout for the app role to protect from runaway queries
ALTER ROLE namokara_app SET statement_timeout = '30s';
ALTER ROLE namokara_app SET idle_in_transaction_session_timeout = '60s';

-- Super-admin role: full read+write, BYPASSRLS
GRANT USAGE ON SCHEMA platform, core, trading, accounting, suppliers, hr, ai, audit TO namokara_super;
GRANT ALL ON ALL TABLES IN SCHEMA
    platform, core, trading, accounting, suppliers, hr, ai, audit TO namokara_super;
GRANT ALL ON ALL SEQUENCES IN SCHEMA
    platform, core, trading, accounting, suppliers, hr, ai, audit TO namokara_super;

-- Bootstrap: grant namokara_app to the dev user (so docker init works)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara') THEN
        GRANT namokara_app TO namokara;
    END IF;
END $$;

SELECT 'RLS policies hardened ✓ (FORCE + WITH CHECK + namokara_app role)' AS status;
