-- ============================================================================
-- Namokara Suite — P0 Hardening Migration (run after 10-hr.sql)
-- Adds: voucher_counters (atomic numbering), RLS hardening, e-invoice columns,
--       per-tenant AI cache, audit log structure, FK back-fills, format CHECKs.
-- Date: 2026-05-27
-- ============================================================================

-- ----------------------------------------------------------------------------
-- P0-3: voucher_counters — atomic UPSERT...RETURNING per (firm, branch, type, FY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.voucher_counters (
    firm_id      UUID NOT NULL REFERENCES platform.firms(id) ON DELETE RESTRICT,
    branch_id    UUID NOT NULL REFERENCES core.branches(id) ON DELETE RESTRICT,
    counter_key  TEXT NOT NULL,        -- e.g. 'voucher.sales', 'voucher.purchase', 'bill.sales'
    fy_year      INT  NOT NULL,        -- 2025 = FY 2025-26
    next_no      BIGINT NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (firm_id, branch_id, counter_key, fy_year)
);

COMMENT ON TABLE platform.voucher_counters IS
    'Atomic counter for voucher and bill numbers. UPDATE...RETURNING ensures no duplicates under concurrency.';

-- RLS on voucher_counters
ALTER TABLE platform.voucher_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.voucher_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY voucher_counters_firm_iso ON platform.voucher_counters
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

-- ----------------------------------------------------------------------------
-- P0-8: WITH CHECK on all existing RLS policies
-- (Re-drop and recreate with WITH CHECK clause)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname IN ('core', 'platform', 'trading', 'accounting', 'suppliers', 'hr', 'ai')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- P0-6 + P0-7: FORCE ROW LEVEL SECURITY on every firm_id-bearing table
-- (Postgres normally lets table owner bypass RLS; FORCE blocks that)
-- ----------------------------------------------------------------------------

-- Helper macro: enable RLS + force + standard firm_isolation policy
CREATE OR REPLACE FUNCTION platform.apply_firm_rls(p_schema TEXT, p_table TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
    EXECUTE format('ALTER TABLE %I.%I FORCE  ROW LEVEL SECURITY', p_schema, p_table);
    EXECUTE format($f$
        CREATE POLICY %I_firm_iso ON %I.%I
        USING       (firm_id = core.current_firm_id())
        WITH CHECK  (firm_id = core.current_firm_id())
    $f$, p_table, p_schema, p_table);
END $$;

-- Apply to every firm-scoped table (idempotent — drop policy first via the loop above)
SELECT platform.apply_firm_rls('core', 'branches');
SELECT platform.apply_firm_rls('core', 'departments');
SELECT platform.apply_firm_rls('core', 'users');
SELECT platform.apply_firm_rls('core', 'contacts');
SELECT platform.apply_firm_rls('core', 'roles');
SELECT platform.apply_firm_rls('accounting', 'account_heads');
SELECT platform.apply_firm_rls('accounting', 'account_groups');
SELECT platform.apply_firm_rls('accounting', 'sub_groups');
SELECT platform.apply_firm_rls('accounting', 'ledgers');
SELECT platform.apply_firm_rls('accounting', 'vouchers');
SELECT platform.apply_firm_rls('trading', 'party_profiles');
SELECT platform.apply_firm_rls('trading', 'items');
SELECT platform.apply_firm_rls('trading', 'orders');
SELECT platform.apply_firm_rls('trading', 'bills');
SELECT platform.apply_firm_rls('trading', 'payments');
SELECT platform.apply_firm_rls('trading', 'gr');
SELECT platform.apply_firm_rls('suppliers', 'supplier_profiles');
SELECT platform.apply_firm_rls('hr', 'attendance_policies');
SELECT platform.apply_firm_rls('hr', 'employee_profiles');
SELECT platform.apply_firm_rls('hr', 'attendance_logs');
SELECT platform.apply_firm_rls('hr', 'leave_requests');
SELECT platform.apply_firm_rls('hr', 'payroll_records');

-- ----------------------------------------------------------------------------
-- P0-9: RLS on previously-missed critical tables
-- ----------------------------------------------------------------------------

-- core.sessions — join through users
ALTER TABLE core.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.sessions FORCE  ROW LEVEL SECURITY;
CREATE POLICY sessions_firm_iso ON core.sessions
    USING (EXISTS (
        SELECT 1 FROM core.users u
        WHERE u.id = core.sessions.user_id
          AND u.firm_id = core.current_firm_id()))
    WITH CHECK (EXISTS (
        SELECT 1 FROM core.users u
        WHERE u.id = core.sessions.user_id
          AND u.firm_id = core.current_firm_id()));

-- core.user_roles — join through users
ALTER TABLE core.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.user_roles FORCE  ROW LEVEL SECURITY;
CREATE POLICY user_roles_firm_iso ON core.user_roles
    USING (EXISTS (
        SELECT 1 FROM core.users u
        WHERE u.id = core.user_roles.user_id
          AND u.firm_id = core.current_firm_id()))
    WITH CHECK (EXISTS (
        SELECT 1 FROM core.users u
        WHERE u.id = core.user_roles.user_id
          AND u.firm_id = core.current_firm_id()));

-- accounting.voucher_lines — join through vouchers
ALTER TABLE accounting.voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.voucher_lines FORCE  ROW LEVEL SECURITY;
CREATE POLICY voucher_lines_firm_iso ON accounting.voucher_lines
    USING (EXISTS (
        SELECT 1 FROM accounting.vouchers v
        WHERE v.id = accounting.voucher_lines.voucher_id
          AND v.firm_id = core.current_firm_id()))
    WITH CHECK (EXISTS (
        SELECT 1 FROM accounting.vouchers v
        WHERE v.id = accounting.voucher_lines.voucher_id
          AND v.firm_id = core.current_firm_id()));

-- trading.bill_lines — join through bills
ALTER TABLE trading.bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.bill_lines FORCE  ROW LEVEL SECURITY;
CREATE POLICY bill_lines_firm_iso ON trading.bill_lines
    USING (EXISTS (
        SELECT 1 FROM trading.bills b
        WHERE b.id = trading.bill_lines.bill_id
          AND b.firm_id = core.current_firm_id()))
    WITH CHECK (EXISTS (
        SELECT 1 FROM trading.bills b
        WHERE b.id = trading.bill_lines.bill_id
          AND b.firm_id = core.current_firm_id()));

-- platform.wallet_ledger
ALTER TABLE platform.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.wallet_ledger FORCE  ROW LEVEL SECURITY;
CREATE POLICY wallet_ledger_firm_iso ON platform.wallet_ledger
    USING (firm_id = core.current_firm_id()
        OR current_setting('app.is_platform_admin', true) = 'true')
    WITH CHECK (firm_id = core.current_firm_id()
        OR current_setting('app.is_platform_admin', true) = 'true');

-- ----------------------------------------------------------------------------
-- P0-10: Per-tenant AI cache (was global → cross-tenant data leak)
-- ----------------------------------------------------------------------------
ALTER TABLE ai.cache DROP CONSTRAINT IF EXISTS cache_pkey;
ALTER TABLE ai.cache ADD COLUMN IF NOT EXISTS firm_id UUID;
UPDATE ai.cache SET firm_id = (SELECT id FROM platform.firms LIMIT 1) WHERE firm_id IS NULL;
ALTER TABLE ai.cache ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE ai.cache ADD CONSTRAINT cache_pkey PRIMARY KEY (firm_id, cache_key);
ALTER TABLE ai.cache ADD CONSTRAINT cache_firm_fk
    FOREIGN KEY (firm_id) REFERENCES platform.firms(id) ON DELETE CASCADE;

ALTER TABLE ai.cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.cache FORCE  ROW LEVEL SECURITY;
CREATE POLICY cache_firm_iso ON ai.cache
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

-- ----------------------------------------------------------------------------
-- P1: Missing firm_id FKs (back-fill RESTRICT — don't cascade book records)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- accounting.vouchers
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'vouchers_firm_fk') THEN
        ALTER TABLE accounting.vouchers ADD CONSTRAINT vouchers_firm_fk
            FOREIGN KEY (firm_id) REFERENCES platform.firms(id) ON DELETE RESTRICT;
    END IF;

    -- trading.bills
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'bills_firm_fk') THEN
        ALTER TABLE trading.bills ADD CONSTRAINT bills_firm_fk
            FOREIGN KEY (firm_id) REFERENCES platform.firms(id) ON DELETE RESTRICT;
    END IF;

    -- trading.payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'payments_firm_fk') THEN
        ALTER TABLE trading.payments ADD CONSTRAINT payments_firm_fk
            FOREIGN KEY (firm_id) REFERENCES platform.firms(id) ON DELETE RESTRICT;
    END IF;

    -- trading.orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'orders_firm_fk') THEN
        ALTER TABLE trading.orders ADD CONSTRAINT orders_firm_fk
            FOREIGN KEY (firm_id) REFERENCES platform.firms(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- P1: GST format CHECK constraints (15-char GSTIN with state-code prefix)
-- ----------------------------------------------------------------------------
ALTER TABLE platform.firms DROP CONSTRAINT IF EXISTS firms_gstin_format;
ALTER TABLE platform.firms ADD CONSTRAINT firms_gstin_format CHECK (
    gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
);

ALTER TABLE core.contacts DROP CONSTRAINT IF EXISTS contacts_gstin_format;
ALTER TABLE core.contacts ADD CONSTRAINT contacts_gstin_format CHECK (
    gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
);

-- PAN: 5 letters + 4 digits + 1 letter
ALTER TABLE platform.firms DROP CONSTRAINT IF EXISTS firms_pan_format;
ALTER TABLE platform.firms ADD CONSTRAINT firms_pan_format CHECK (
    pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
);

ALTER TABLE core.contacts DROP CONSTRAINT IF EXISTS contacts_pan_format;
ALTER TABLE core.contacts ADD CONSTRAINT contacts_pan_format CHECK (
    pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
);

-- ----------------------------------------------------------------------------
-- P1: e-invoice columns on bills (mandatory for B2B > ₹5cr turnover)
-- ----------------------------------------------------------------------------
ALTER TABLE trading.bills
    ADD COLUMN IF NOT EXISTS place_of_supply       TEXT,
    ADD COLUMN IF NOT EXISTS reverse_charge        BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS e_invoice_irn         TEXT,
    ADD COLUMN IF NOT EXISTS e_invoice_qr          TEXT,
    ADD COLUMN IF NOT EXISTS e_invoice_ack_no      TEXT,
    ADD COLUMN IF NOT EXISTS e_invoice_ack_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS e_way_bill_no         TEXT,
    ADD COLUMN IF NOT EXISTS supplier_gstin_snap   TEXT,  -- snapshot of seller GSTIN at bill time
    ADD COLUMN IF NOT EXISTS buyer_gstin_snap      TEXT;  -- snapshot of buyer GSTIN at bill time

-- ----------------------------------------------------------------------------
-- P1: Generated fy_year column on bills for FY-aware uniqueness
-- ----------------------------------------------------------------------------
ALTER TABLE trading.bills
    ADD COLUMN IF NOT EXISTS fy_year SMALLINT
    GENERATED ALWAYS AS (
        CASE WHEN EXTRACT(month FROM bill_date) >= 4
             THEN EXTRACT(year FROM bill_date)::SMALLINT
             ELSE (EXTRACT(year FROM bill_date) - 1)::SMALLINT
        END
    ) STORED;

DROP INDEX IF EXISTS trading.idx_bills_no;
CREATE UNIQUE INDEX idx_bills_no_fy ON trading.bills
    (firm_id, branch_id, bill_type, fy_year, bill_no)
    WHERE deleted_at IS NULL;

-- Same for vouchers
ALTER TABLE accounting.vouchers
    ADD COLUMN IF NOT EXISTS fy_year SMALLINT
    GENERATED ALWAYS AS (
        CASE WHEN EXTRACT(month FROM voucher_date) >= 4
             THEN EXTRACT(year FROM voucher_date)::SMALLINT
             ELSE (EXTRACT(year FROM voucher_date) - 1)::SMALLINT
        END
    ) STORED;

DROP INDEX IF EXISTS accounting.idx_vouchers_firm_no;
CREATE UNIQUE INDEX idx_vouchers_firm_no_fy ON accounting.vouchers
    (firm_id, branch_id, voucher_type, fy_year, voucher_no)
    WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- P1: audit log structure (P0-13 / SOC 2 prep)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit.admin_actions (
    id           BIGSERIAL PRIMARY KEY,
    actor_id     UUID NOT NULL,
    actor_email  TEXT,
    action       TEXT NOT NULL,             -- 'firm.suspend', 'wallet.recharge', 'plan.change'
    target_type  TEXT NOT NULL,             -- 'firm', 'user'
    target_id    UUID,
    payload      JSONB,
    ip_address   TEXT,
    user_agent   TEXT,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_actor ON audit.admin_actions (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON audit.admin_actions (target_type, target_id, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- P1: Standardise status TEXT → CHECK enums
-- ----------------------------------------------------------------------------
ALTER TABLE trading.bills DROP CONSTRAINT IF EXISTS bills_status_chk;
ALTER TABLE trading.bills ADD CONSTRAINT bills_status_chk CHECK (
    status IN ('pending','partial','paid','overdue','cancelled')
);

ALTER TABLE platform.firms DROP CONSTRAINT IF EXISTS firms_status_chk;
ALTER TABLE platform.firms ADD CONSTRAINT firms_status_chk CHECK (
    status IN ('trial','active','suspended','cancelled','low_wallet')
);

-- ----------------------------------------------------------------------------
-- Grant the namokara_app role read+write on the new objects (P0-6 prereq)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON platform.voucher_counters TO namokara_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON audit.admin_actions TO namokara_app;
        GRANT USAGE ON SEQUENCE audit.admin_actions_id_seq TO namokara_app;
    END IF;
END $$;

-- ============================================================================
-- DONE — P0 hardening applied.
-- Verification queries:
--   SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname IN ('core','platform','trading','accounting','hr','ai') ORDER BY schemaname, tablename;
--   SELECT schemaname, tablename, policyname FROM pg_policies ORDER BY schemaname, tablename;
-- ============================================================================
