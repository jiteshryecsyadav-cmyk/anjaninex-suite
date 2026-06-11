-- ============================================================================
-- Namokara Suite — Accounting Module Tables
-- Tally-style double-entry: Heads → Groups → Sub Groups → Ledgers → Vouchers
-- ============================================================================

-- =================================================
-- 1. ACCOUNT HEADS (top level: Assets, Liabilities, Capital, Income, Expenses)
-- =================================================
CREATE TABLE accounting.account_heads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    nature          TEXT NOT NULL,        -- 'assets'|'liabilities'|'capital'|'income'|'expenses'
    sign            CHAR(2) NOT NULL,     -- 'Dr' or 'Cr' (natural balance side)
    sort_order      INT,
    is_system       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, code)
);
CREATE INDEX idx_heads_firm ON accounting.account_heads(firm_id, sort_order);

-- =================================================
-- 2. ACCOUNT GROUPS (e.g., Current Assets, Fixed Assets under Assets)
-- =================================================
CREATE TABLE accounting.account_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    head_id         UUID NOT NULL REFERENCES accounting.account_heads(id),
    code            TEXT,
    name            TEXT NOT NULL,
    is_system       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_groups_firm_head ON accounting.account_groups(firm_id, head_id);

-- =================================================
-- 3. SUB GROUPS (e.g., Bank Accounts, Cash-in-Hand under Current Assets)
-- =================================================
CREATE TABLE accounting.sub_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    group_id        UUID NOT NULL REFERENCES accounting.account_groups(id),
    code            TEXT,
    name            TEXT NOT NULL,
    is_system       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sub_groups_firm_group ON accounting.sub_groups(firm_id, group_id);

-- =================================================
-- 4. LEDGERS (actual accounts where transactions happen)
-- =================================================
CREATE TABLE accounting.ledgers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    sub_group_id   UUID NOT NULL REFERENCES accounting.sub_groups(id),
    contact_id      UUID REFERENCES core.contacts(id),   -- if linked to a party/supplier
    code            TEXT,
    name            TEXT NOT NULL,
    opening_balance NUMERIC(14,2) DEFAULT 0,
    opening_type    CHAR(2) DEFAULT 'Dr',
    is_revenue_account BOOLEAN DEFAULT FALSE,
    tax_settings    JSONB DEFAULT '{}',
    bank_account_no TEXT,
    bank_ifsc       TEXT,
    bank_branch     TEXT,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ledgers_firm_name ON accounting.ledgers USING gin (firm_id, name gin_trgm_ops);
CREATE INDEX idx_ledgers_sub_group ON accounting.ledgers(sub_group_id);
CREATE INDEX idx_ledgers_contact ON accounting.ledgers(contact_id) WHERE contact_id IS NOT NULL;

-- =================================================
-- 5. VOUCHERS (the transaction header)
-- =================================================
CREATE TABLE accounting.vouchers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    branch_id       UUID NOT NULL REFERENCES core.branches(id),
    voucher_type    TEXT NOT NULL,        -- payment|receipt|contra|journal|sales|purchase
    voucher_no      TEXT NOT NULL,
    voucher_date    DATE NOT NULL,
    narration       TEXT,
    total_amount    NUMERIC(14,2) NOT NULL,
    source_module   TEXT,                  -- 'trading'|'accounting'|'hr'
    source_ref_id   UUID,                  -- e.g., bill_id if auto-posted from Trading
    is_posted       BOOLEAN DEFAULT TRUE,
    is_reconciled   BOOLEAN DEFAULT FALSE,
    reconciled_at   TIMESTAMPTZ,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_vouchers_firm_branch_date ON accounting.vouchers(firm_id, branch_id, voucher_date DESC);
CREATE INDEX idx_vouchers_type ON accounting.vouchers(firm_id, voucher_type);
CREATE INDEX idx_vouchers_source ON accounting.vouchers(source_module, source_ref_id)
    WHERE source_ref_id IS NOT NULL;
CREATE UNIQUE INDEX idx_vouchers_firm_no ON accounting.vouchers(firm_id, branch_id, voucher_type, voucher_no);

-- =================================================
-- 6. VOUCHER LINES (debit/credit pairs — double entry)
-- =================================================
CREATE TABLE accounting.voucher_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id      UUID NOT NULL REFERENCES accounting.vouchers(id) ON DELETE CASCADE,
    ledger_id       UUID NOT NULL REFERENCES accounting.ledgers(id),
    debit_credit    CHAR(2) NOT NULL CHECK (debit_credit IN ('Dr','Cr')),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    narration       TEXT,
    sort_order      INT
);
CREATE INDEX idx_vl_voucher ON accounting.voucher_lines(voucher_id);
CREATE INDEX idx_vl_ledger ON accounting.voucher_lines(ledger_id);

-- =================================================
-- Balance check trigger — Dr total must equal Cr total per voucher
-- =================================================
CREATE OR REPLACE FUNCTION accounting.check_voucher_balanced() RETURNS TRIGGER AS $$
DECLARE
    v_dr NUMERIC := 0;
    v_cr NUMERIC := 0;
    v_voucher_id UUID;
BEGIN
    v_voucher_id := COALESCE(NEW.voucher_id, OLD.voucher_id);

    SELECT
        COALESCE(SUM(CASE WHEN debit_credit='Dr' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN debit_credit='Cr' THEN amount ELSE 0 END), 0)
    INTO v_dr, v_cr
    FROM accounting.voucher_lines
    WHERE voucher_id = v_voucher_id;

    IF v_dr <> v_cr THEN
        RAISE EXCEPTION 'Voucher % is unbalanced: Dr=% Cr=%', v_voucher_id, v_dr, v_cr;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_voucher_balanced
    AFTER INSERT OR UPDATE OR DELETE ON accounting.voucher_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION accounting.check_voucher_balanced();

-- =================================================
-- RLS policies
-- =================================================
ALTER TABLE accounting.account_heads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.account_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.sub_groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ledgers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.vouchers        ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_isolation_heads   ON accounting.account_heads   USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_groups  ON accounting.account_groups  USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_sub_groups ON accounting.sub_groups   USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_ledgers ON accounting.ledgers         USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_vouchers ON accounting.vouchers       USING (firm_id = current_firm_id());

SELECT 'Accounting tables created ✓' AS status;
