-- ============================================================================
-- Namokara Suite — Trading Module Tables
-- Parties, Orders, Bills, Payments, Goods Return, Commission
-- ============================================================================

-- =================================================
-- 1. PARTY PROFILES (extends core.contacts)
-- =================================================
CREATE TABLE trading.party_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
    party_code      TEXT,
    party_type      TEXT NOT NULL DEFAULT 'buyer',   -- buyer|seller|both
    credit_limit    NUMERIC(14,2) DEFAULT 0,
    credit_days     INT DEFAULT 30,
    commission_rate NUMERIC(5,2) DEFAULT 0,
    default_transporter_id UUID,
    opening_balance NUMERIC(14,2) DEFAULT 0,
    opening_type    CHAR(2) DEFAULT 'Dr',
    ledger_id       UUID REFERENCES accounting.ledgers(id),
    credit_rating   CHAR(1),                          -- A/B/C
    price_list_id   UUID,
    tax_treatment   TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, contact_id),
    UNIQUE (firm_id, party_code)
);
CREATE INDEX idx_parties_firm ON trading.party_profiles(firm_id) WHERE is_active = TRUE;
CREATE INDEX idx_parties_contact ON trading.party_profiles(contact_id);

-- =================================================
-- 2. ITEMS (simple product/SKU master)
-- =================================================
CREATE TABLE trading.items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    code            TEXT,
    name            TEXT NOT NULL,
    hsn_sac         TEXT,
    unit            TEXT DEFAULT 'PCS',
    default_rate    NUMERIC(12,2) DEFAULT 0,
    tax_rate        NUMERIC(5,2) DEFAULT 0,
    category        TEXT,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, code)
);
CREATE INDEX idx_items_firm_name ON trading.items USING gin(firm_id, name gin_trgm_ops);

-- =================================================
-- 3. ORDERS (sales orders / purchase orders)
-- =================================================
CREATE TABLE trading.orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    branch_id       UUID NOT NULL REFERENCES core.branches(id),
    order_type      TEXT NOT NULL DEFAULT 'sales',  -- sales|purchase
    order_no        TEXT NOT NULL,
    order_date      DATE NOT NULL,
    party_id        UUID NOT NULL REFERENCES trading.party_profiles(id),
    expected_delivery DATE,
    status          TEXT DEFAULT 'pending',          -- pending|partial|completed|cancelled
    subtotal        NUMERIC(14,2) DEFAULT 0,
    tax_amount      NUMERIC(14,2) DEFAULT 0,
    total           NUMERIC(14,2) DEFAULT 0,
    notes           TEXT,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_orders_firm_branch_date ON trading.orders(firm_id, branch_id, order_date DESC);
CREATE INDEX idx_orders_party ON trading.orders(party_id);
CREATE INDEX idx_orders_status ON trading.orders(firm_id, status) WHERE status IN ('pending', 'partial');
CREATE UNIQUE INDEX idx_orders_no ON trading.orders(firm_id, branch_id, order_no);

CREATE TABLE trading.order_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES trading.orders(id) ON DELETE CASCADE,
    item_id         UUID REFERENCES trading.items(id),
    item_name       TEXT NOT NULL,
    hsn_sac         TEXT,
    qty             NUMERIC(12,3) NOT NULL,
    qty_delivered   NUMERIC(12,3) DEFAULT 0,
    unit            TEXT,
    rate            NUMERIC(12,2) NOT NULL,
    discount_pct    NUMERIC(5,2) DEFAULT 0,
    tax_rate        NUMERIC(5,2) DEFAULT 0,
    taxable_amount  NUMERIC(14,2) NOT NULL,
    total_amount    NUMERIC(14,2) NOT NULL,
    sort_order      INT
);

-- =================================================
-- 4. BILLS (Sales / Purchase invoices)
-- =================================================
CREATE TABLE trading.bills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    branch_id       UUID NOT NULL REFERENCES core.branches(id),
    bill_type       TEXT NOT NULL DEFAULT 'sales',  -- sales|purchase
    bill_no         TEXT NOT NULL,
    bill_date       DATE NOT NULL,
    party_id        UUID NOT NULL REFERENCES trading.party_profiles(id),
    order_id        UUID REFERENCES trading.orders(id),
    invoice_type    TEXT,                            -- tax|bill_of_supply|export
    po_number       TEXT,
    delivery_date   DATE,
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount        NUMERIC(14,2) DEFAULT 0,
    taxable_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    cgst            NUMERIC(14,2) DEFAULT 0,
    sgst            NUMERIC(14,2) DEFAULT 0,
    igst            NUMERIC(14,2) DEFAULT 0,
    round_off       NUMERIC(6,2) DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    paid_amount     NUMERIC(14,2) DEFAULT 0,
    status          TEXT DEFAULT 'pending',          -- pending|partial|paid|overdue|cancelled
    voucher_id      UUID REFERENCES accounting.vouchers(id),  -- auto-posted voucher
    ai_extracted    BOOLEAN DEFAULT FALSE,
    ai_extraction_id UUID,
    bill_image_url  TEXT,
    notes           TEXT,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_bills_firm_branch_date ON trading.bills(firm_id, branch_id, bill_date DESC);
CREATE INDEX idx_bills_party ON trading.bills(party_id);
CREATE INDEX idx_bills_status ON trading.bills(firm_id, status) WHERE status IN ('pending', 'partial', 'overdue');
CREATE UNIQUE INDEX idx_bills_no ON trading.bills(firm_id, branch_id, bill_type, bill_no);

CREATE TABLE trading.bill_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id         UUID NOT NULL REFERENCES trading.bills(id) ON DELETE CASCADE,
    item_id         UUID REFERENCES trading.items(id),
    item_name       TEXT NOT NULL,
    hsn_sac         TEXT,
    qty             NUMERIC(12,3) NOT NULL,
    unit            TEXT,
    rate            NUMERIC(12,2) NOT NULL,
    discount_pct    NUMERIC(5,2) DEFAULT 0,
    tax_rate        NUMERIC(5,2) DEFAULT 0,
    taxable_amount  NUMERIC(14,2) NOT NULL,
    total_amount    NUMERIC(14,2) NOT NULL,
    sort_order      INT
);
CREATE INDEX idx_bill_lines_bill ON trading.bill_lines(bill_id);

-- =================================================
-- 5. PAYMENTS (Receipt / Payment vouchers)
-- =================================================
CREATE TABLE trading.payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    branch_id       UUID NOT NULL REFERENCES core.branches(id),
    payment_type    TEXT NOT NULL DEFAULT 'receipt',  -- receipt|payment
    payment_no      TEXT NOT NULL,
    payment_date    DATE NOT NULL,
    party_id        UUID NOT NULL REFERENCES trading.party_profiles(id),
    payment_mode    TEXT NOT NULL,                    -- cash|cheque|neft|rtgs|upi|card
    amount          NUMERIC(14,2) NOT NULL,
    reference_no    TEXT,
    bank_name       TEXT,
    bank_branch     TEXT,
    bank_ledger_id  UUID REFERENCES accounting.ledgers(id),  -- which cash/bank ledger
    voucher_id      UUID REFERENCES accounting.vouchers(id),
    notes           TEXT,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_payments_firm_branch_date ON trading.payments(firm_id, branch_id, payment_date DESC);
CREATE INDEX idx_payments_party ON trading.payments(party_id);
CREATE UNIQUE INDEX idx_payments_no ON trading.payments(firm_id, branch_id, payment_type, payment_no);

CREATE TABLE trading.payment_allocations (
    payment_id      UUID NOT NULL REFERENCES trading.payments(id) ON DELETE CASCADE,
    bill_id         UUID NOT NULL REFERENCES trading.bills(id),
    allocated       NUMERIC(14,2) NOT NULL,
    PRIMARY KEY (payment_id, bill_id)
);

-- =================================================
-- 6. GOODS RETURN (GR / Credit note)
-- =================================================
CREATE TABLE trading.gr (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    branch_id       UUID NOT NULL REFERENCES core.branches(id),
    gr_no           TEXT NOT NULL,
    gr_date         DATE NOT NULL,
    party_id        UUID NOT NULL REFERENCES trading.party_profiles(id),
    original_bill_id UUID REFERENCES trading.bills(id),
    reason          TEXT,
    total_return_amount NUMERIC(14,2) NOT NULL,
    voucher_id      UUID REFERENCES accounting.vouchers(id),
    notes           TEXT,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE trading.gr_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gr_id           UUID NOT NULL REFERENCES trading.gr(id) ON DELETE CASCADE,
    item_id         UUID REFERENCES trading.items(id),
    item_name       TEXT NOT NULL,
    qty             NUMERIC(12,3) NOT NULL,
    unit            TEXT,
    rate            NUMERIC(12,2) NOT NULL,
    tax_rate        NUMERIC(5,2) DEFAULT 0,
    total_amount    NUMERIC(14,2) NOT NULL,
    sort_order      INT
);

-- =================================================
-- 7. COMMISSION
-- =================================================
CREATE TABLE trading.commission (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    branch_id       UUID NOT NULL,
    bill_id         UUID REFERENCES trading.bills(id),
    party_id        UUID REFERENCES trading.party_profiles(id),
    commission_pct  NUMERIC(5,2),
    commission_amount NUMERIC(14,2) NOT NULL,
    is_paid         BOOLEAN DEFAULT FALSE,
    paid_at         TIMESTAMPTZ,
    payment_id      UUID REFERENCES trading.payments(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- =================================================
-- RLS policies
-- =================================================
ALTER TABLE trading.party_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.bills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.gr             ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.commission     ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_isolation_parties     ON trading.party_profiles USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_items       ON trading.items          USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_orders      ON trading.orders         USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_bills       ON trading.bills          USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_payments    ON trading.payments       USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_gr          ON trading.gr             USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_commission  ON trading.commission     USING (firm_id = current_firm_id());

SELECT 'Trading tables created ✓' AS status;
