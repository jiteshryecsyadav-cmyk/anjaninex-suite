-- =================================================
-- COMMISSION INVOICES — broker commission e-invoices
-- Generated from source bills (bulk consolidation)
-- =================================================

CREATE TABLE IF NOT EXISTS trading.commission_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             UUID NOT NULL,
    branch_id           UUID NOT NULL REFERENCES core.branches(id),

    invoice_no          TEXT NOT NULL,
    invoice_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    party_id            UUID NOT NULL REFERENCES trading.party_profiles(id),

    commission_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
    gross_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,     -- sum of source bill amounts
    commission_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,     -- commission base
    gst_pct             NUMERIC(5,2) DEFAULT 18,
    gst_amount          NUMERIC(14,2) DEFAULT 0,
    total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,     -- commission + gst

    status              TEXT DEFAULT 'pending',                -- pending|paid|cancelled
    notes               TEXT,

    created_by          UUID NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE (firm_id, invoice_no)
);

CREATE INDEX IF NOT EXISTS idx_comm_inv_firm ON trading.commission_invoices(firm_id);
CREATE INDEX IF NOT EXISTS idx_comm_inv_party ON trading.commission_invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_comm_inv_date ON trading.commission_invoices(invoice_date DESC);

CREATE TABLE IF NOT EXISTS trading.commission_invoice_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_invoice_id   UUID NOT NULL REFERENCES trading.commission_invoices(id) ON DELETE CASCADE,
    bill_id                 UUID NOT NULL REFERENCES trading.bills(id),
    bill_no                 TEXT NOT NULL,
    bill_date               DATE NOT NULL,
    bill_amount             NUMERIC(14,2) NOT NULL,
    commission_pct          NUMERIC(5,2) NOT NULL,
    commission_amount       NUMERIC(14,2) NOT NULL,
    sort_order              INT
);

CREATE INDEX IF NOT EXISTS idx_comm_inv_lines_inv ON trading.commission_invoice_lines(commission_invoice_id);

SELECT 'commission_invoices tables created ✓' AS status;
