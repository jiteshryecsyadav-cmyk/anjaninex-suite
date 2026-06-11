-- ============================================================================
-- Namokara Suite — PostgreSQL Extensions
-- Runs automatically when container starts (Docker entrypoint)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom function for current firm context (used by RLS)
CREATE OR REPLACE FUNCTION current_firm_id() RETURNS UUID AS $$
BEGIN
    RETURN nullif(current_setting('app.current_firm_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Custom function for current branch context
CREATE OR REPLACE FUNCTION current_branch_id() RETURNS UUID AS $$
BEGIN
    RETURN nullif(current_setting('app.current_branch_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Custom function for current user context
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
    RETURN nullif(current_setting('app.current_user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

SELECT 'Extensions and context functions ready ✓' AS status;
