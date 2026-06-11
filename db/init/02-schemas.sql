-- ============================================================================
-- Namokara Suite — Schema Organization
-- One database, multiple schemas (logical separation per module)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS platform;    -- Anjaninex master (firms, plans, wallets)
CREATE SCHEMA IF NOT EXISTS core;        -- Users, roles, contacts, branches
CREATE SCHEMA IF NOT EXISTS trading;     -- Parties, orders, bills, payments
CREATE SCHEMA IF NOT EXISTS accounting;  -- Chart of accounts, vouchers, ledgers
CREATE SCHEMA IF NOT EXISTS suppliers;   -- Supplier directory, photos
CREATE SCHEMA IF NOT EXISTS hr;          -- Employees, attendance, payroll
CREATE SCHEMA IF NOT EXISTS ai;          -- Extraction logs, cache, agent runs
CREATE SCHEMA IF NOT EXISTS audit;       -- Audit logs (immutable)

COMMENT ON SCHEMA platform   IS 'Anjaninex SaaS owner tables (multi-tenant master)';
COMMENT ON SCHEMA core       IS 'Cross-module: users, RBAC, branches, contacts hub';
COMMENT ON SCHEMA trading    IS 'Trading module: parties, orders, bills, payments, GR';
COMMENT ON SCHEMA accounting IS 'Accounting module: heads, groups, ledgers, vouchers';
COMMENT ON SCHEMA suppliers  IS 'Suppliers directory: profiles, photos, rates';
COMMENT ON SCHEMA hr         IS 'HR module: employees, attendance, leave, payroll';
COMMENT ON SCHEMA ai         IS 'AI subsystem: extraction logs, caching, agent runs';
COMMENT ON SCHEMA audit      IS 'Audit trail (write-only from app perspective)';

SELECT 'Schemas created ✓' AS status;
