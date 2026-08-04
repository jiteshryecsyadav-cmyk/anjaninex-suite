-- ============================================================================
-- 123: MANUFACTURER — Sales Order + Delivery Challan
-- ============================================================================
-- Purchase ka aaina: wahan mangaya→aaya, yahan bika→gaya.
--
--   Sales Order     — grahak ne kya manga (stock nahi hilta)
--   Delivery Challan— maal sach me nikla  (stock GHATTA hai)
--
-- Tax Invoice yahan NAHI hai. Wo jaan-boojh kar `trading.bills` me jayega —
-- Credil GST par network score wahi se banati hai. Agar manufacturer ka bill
-- alag table me rakha to wo poore platform ke sabse bade faayde se bahar ho
-- jayega. Challan tak ka kaam manufacturer ka apna hai, isliye wo yahan hai.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SALES ORDER — grahak ka order
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.sales_orders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id    UUID REFERENCES mfg.godowns(id),
    so_no        TEXT NOT NULL,
    party_id     UUID NOT NULL,          -- trading.party_profiles (buyer)
    agent_id     UUID REFERENCES mfg.agents(id) ON DELETE SET NULL,
    order_date   DATE NOT NULL DEFAULT current_date,
    due_at       DATE,
    transport    TEXT,
    -- Grahak ka apna order number — wo isi se poochta hai, hamare SO number se nahi
    buyer_ref    TEXT,
    note         TEXT,
    status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','partial','done','cancelled')),
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS so_firm_no_uq ON mfg.sales_orders (firm_id, so_no);
CREATE INDEX IF NOT EXISTS so_open_ix
    ON mfg.sales_orders (firm_id, party_id) WHERE status IN ('open','partial');

CREATE TABLE IF NOT EXISTS mfg.sales_order_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    so_id       UUID NOT NULL REFERENCES mfg.sales_orders(id) ON DELETE CASCADE,
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    size        TEXT,
    qty         NUMERIC(14,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Pcs',
    rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Ratio se bhari line ka nishaan (S:1 M:2 L:1) — sirf dikhane ke liye,
    -- ginti hamesha qty se hoti hai
    ratio_note  TEXT
);
CREATE INDEX IF NOT EXISTS so_lines_so_ix ON mfg.sales_order_lines (so_id);

-- ----------------------------------------------------------------------------
-- 2. DELIVERY CHALLAN — maal sach me nikla
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.delivery_challans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id     UUID NOT NULL REFERENCES mfg.godowns(id),
    dc_no         TEXT NOT NULL,
    so_id         UUID REFERENCES mfg.sales_orders(id),   -- bina order ke bhi nikal sakta hai
    party_id      UUID NOT NULL,
    challan_date  DATE NOT NULL DEFAULT current_date,
    -- Transporter aur builty — maal raste me kahan hai, iska ek hi sabooot yahi hai
    transporter_id UUID,
    transport     TEXT,
    lr_no         TEXT,
    vehicle_no    TEXT,
    -- Kitne gathar/bore gaye — grahak wahi ginta hai, piece nahi
    packages      INT,
    note          TEXT,
    -- Bill ban gaya to yahan bill ki id — dobara bill na bane
    billed_ref_id UUID,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dc_firm_no_uq ON mfg.delivery_challans (firm_id, dc_no);
CREATE INDEX IF NOT EXISTS dc_so_ix ON mfg.delivery_challans (so_id);
CREATE INDEX IF NOT EXISTS dc_unbilled_ix
    ON mfg.delivery_challans (firm_id, party_id) WHERE billed_ref_id IS NULL;

CREATE TABLE IF NOT EXISTS mfg.delivery_challan_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    dc_id       UUID NOT NULL REFERENCES mfg.delivery_challans(id) ON DELETE CASCADE,
    so_line_id  UUID REFERENCES mfg.sales_order_lines(id),
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    size        TEXT,
    qty         NUMERIC(14,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Pcs',
    rate        NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dc_lines_dc_ix ON mfg.delivery_challan_lines (dc_id);
CREATE INDEX IF NOT EXISTS dc_lines_soline_ix ON mfg.delivery_challan_lines (so_line_id);

-- Order ki har line par: kitna manga tha, kitna nikal chuka, kitna baki
CREATE OR REPLACE VIEW mfg.v_so_pending AS
SELECT l.firm_id, l.so_id, l.id AS so_line_id, l.item_id, l.colour, l.size,
       l.qty AS ordered,
       COALESCE(d.sent, 0) AS dispatched,
       l.qty - COALESCE(d.sent, 0) AS pending
  FROM mfg.sales_order_lines l
  LEFT JOIN (
        SELECT so_line_id, SUM(qty) AS sent
          FROM mfg.delivery_challan_lines
         WHERE so_line_id IS NOT NULL
         GROUP BY so_line_id
  ) d ON d.so_line_id = l.id;

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales_orders','sales_order_lines',
    'delivery_challans','delivery_challan_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE mfg.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE mfg.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON mfg.%I', t || '_firm_iso', t);
    EXECUTE format(
      'CREATE POLICY %I ON mfg.%I
         USING (firm_id = core.current_firm_id())
         WITH CHECK (firm_id = core.current_firm_id())', t || '_firm_iso', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA mfg TO namokara_app';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA mfg TO namokara_app';
  END IF;
END $$;

SELECT core.assert_rls_policies(ARRAY['mfg']);
SELECT 'manufacturer sales order + challan tayyar ✓' AS status;
