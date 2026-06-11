-- =================================================
-- GOODS RETURNS (GR) — full schema
-- Two effect modes:
--   direct_adjustment: reduce original bill amount (net_bill_after_gr = original - total_return)
--   credit_note: create separate credit note; adjust in future bills
-- =================================================

CREATE TABLE IF NOT EXISTS trading.goods_returns (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                     UUID NOT NULL,
    branch_id                   UUID NOT NULL REFERENCES core.branches(id),

    gr_no                       TEXT NOT NULL,
    gr_date                     DATE NOT NULL,

    supplier_party_id           UUID NOT NULL REFERENCES trading.party_profiles(id),
    buyer_party_id              UUID REFERENCES trading.party_profiles(id),
    original_bill_id            UUID REFERENCES trading.bills(id),

    transport                   TEXT,
    lr_no                       TEXT,
    reason                      TEXT,
    remark                      TEXT,

    effect_mode                 TEXT NOT NULL DEFAULT 'direct_adjustment',
    -- direct_adjustment | credit_note

    original_bill_amount        NUMERIC(14,2) DEFAULT 0,
    total_return_amount         NUMERIC(14,2) DEFAULT 0,
    taxable_amount              NUMERIC(14,2) DEFAULT 0,
    tax_amount                  NUMERIC(14,2) DEFAULT 0,
    net_bill_after_gr           NUMERIC(14,2) DEFAULT 0,

    -- credit note specific
    credit_note_valid_till      DATE,
    credit_note_adjust_future   BOOLEAN DEFAULT TRUE,

    -- commission recalc
    commission_pct              NUMERIC(5,2)  DEFAULT 0,
    commission_amount           NUMERIC(14,2) DEFAULT 0,

    status                      TEXT NOT NULL DEFAULT 'pending',
    -- pending | approved | rejected

    approved_by                 UUID REFERENCES core.users(id),
    approved_at                 TIMESTAMPTZ,
    rejection_reason            TEXT,

    created_by                  UUID NOT NULL,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gr_firm_branch_date ON trading.goods_returns(firm_id, branch_id, gr_date DESC);
CREATE INDEX IF NOT EXISTS idx_gr_supplier ON trading.goods_returns(supplier_party_id);
CREATE INDEX IF NOT EXISTS idx_gr_buyer ON trading.goods_returns(buyer_party_id) WHERE buyer_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gr_bill ON trading.goods_returns(original_bill_id) WHERE original_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gr_status ON trading.goods_returns(firm_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gr_no ON trading.goods_returns(firm_id, branch_id, gr_no);

CREATE TABLE IF NOT EXISTS trading.goods_return_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_return_id UUID NOT NULL REFERENCES trading.goods_returns(id) ON DELETE CASCADE,
    bill_line_id    UUID REFERENCES trading.bill_lines(id),
    item_id         UUID REFERENCES trading.items(id),

    item_name       TEXT NOT NULL,
    description     TEXT,
    hsn_sac         TEXT,

    qty             NUMERIC(12,3) NOT NULL,
    unit            TEXT,
    rate            NUMERIC(12,2) NOT NULL,
    rd              NUMERIC(12,2) DEFAULT 0,
    igst_pct        NUMERIC(5,2)  DEFAULT 0,
    taxable_amount  NUMERIC(14,2) NOT NULL,
    tax_amount      NUMERIC(14,2) DEFAULT 0,
    total_amount    NUMERIC(14,2) NOT NULL,

    sort_order      INT
);
CREATE INDEX IF NOT EXISTS idx_gr_lines_gr ON trading.goods_return_lines(goods_return_id);

COMMENT ON TABLE trading.goods_returns IS 'Goods Return (GR) — return of items from buyer back to supplier. Two effect modes: direct bill reduction OR separate credit note.';
COMMENT ON COLUMN trading.goods_returns.effect_mode IS 'direct_adjustment = reduce original bill, credit_note = create CN for future adjustment';
COMMENT ON COLUMN trading.goods_returns.status IS 'pending → approved (creates Sales Return voucher) OR rejected';
