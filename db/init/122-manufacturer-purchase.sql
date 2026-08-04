-- ============================================================================
-- 122: MANUFACTURER — Purchase Order, Inward, Return
-- ============================================================================
-- Ye table `mfg` me hain, `trading` me nahi. Wajah: manufacturer ki khareed
-- ka dhaancha alag hai — taka, lot number, dealer code, aur "PO me kitna tha /
-- ab tak aaya / aaj aaya" wala teen-tarfa hisaab. trading.orders me ye kuch
-- nahi hai aur usme thoosne se agency ka kaam bigadta.
--
-- (Sales ka bill aage jaakar trading.bills me hi jayega — Credil wahi padhti
--  hai. Khareed Credil me nahi jaati, isliye yahan alag rakhna surakshit hai.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PURCHASE ORDER — mill ko diya hua order
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.purchase_orders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id    UUID REFERENCES mfg.godowns(id),
    po_no        TEXT NOT NULL,          -- ReserveCounterAsync se
    party_id     UUID NOT NULL,          -- trading.party_profiles (supplier)
    agent_id     UUID REFERENCES mfg.agents(id) ON DELETE SET NULL,
    order_date   DATE NOT NULL DEFAULT current_date,
    due_at       DATE,
    transport    TEXT,
    note         TEXT,
    status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','partial','done','cancelled')),
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS po_firm_no_uq ON mfg.purchase_orders (firm_id, po_no);
CREATE INDEX IF NOT EXISTS po_open_ix
    ON mfg.purchase_orders (firm_id, party_id) WHERE status IN ('open','partial');

CREATE TABLE IF NOT EXISTS mfg.purchase_order_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    po_id       UUID NOT NULL REFERENCES mfg.purchase_orders(id) ON DELETE CASCADE,
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    size        TEXT,
    qty         NUMERIC(14,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Meter',
    rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Mill ke yahan is maal ka apna code — unse baat karte waqt yahi bolte hain
    dealer_code TEXT,
    lot_no      TEXT
);
CREATE INDEX IF NOT EXISTS po_lines_po_ix ON mfg.purchase_order_lines (po_id);

-- ----------------------------------------------------------------------------
-- 2. PURCHASE INWARD — maal sach me aaya
--
-- Ek PO ka maal ek baar me nahi aata. Isliye har khep ki apni inward, aur
-- har line par "PO me kitna tha / ab tak aa chuka / aaj aaya" — teeno saath.
-- Bina iske "kitna aur aana baki hai" ka jawab kabhi nahi milta.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.purchase_inwards (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id     UUID NOT NULL REFERENCES mfg.godowns(id),
    inward_no     TEXT NOT NULL,
    po_id         UUID REFERENCES mfg.purchase_orders(id),   -- bina PO ke bhi aa sakta hai
    party_id      UUID NOT NULL,
    inward_date   DATE NOT NULL DEFAULT current_date,
    -- Unka kaagaz — milaan me sabse zyada isi ki zarurat padti hai
    supplier_challan_no TEXT,
    lr_no         TEXT,
    transport     TEXT,
    challan_photo TEXT,
    note          TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inward_firm_no_uq ON mfg.purchase_inwards (firm_id, inward_no);
CREATE INDEX IF NOT EXISTS inward_po_ix ON mfg.purchase_inwards (po_id);

CREATE TABLE IF NOT EXISTS mfg.purchase_inward_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    inward_id   UUID NOT NULL REFERENCES mfg.purchase_inwards(id) ON DELETE CASCADE,
    po_line_id  UUID REFERENCES mfg.purchase_order_lines(id),
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    size        TEXT,
    qty         NUMERIC(14,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Meter',
    -- Mill ka bill ka rate PO se alag ho sakta hai — isliye yahan dobara
    rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
    dealer_code TEXT,
    lot_no      TEXT
);
CREATE INDEX IF NOT EXISTS inward_lines_inward_ix ON mfg.purchase_inward_lines (inward_id);
CREATE INDEX IF NOT EXISTS inward_lines_poline_ix ON mfg.purchase_inward_lines (po_line_id);

-- PO ki har line par: kitna manga tha, kitna aa chuka, kitna baki
CREATE OR REPLACE VIEW mfg.v_po_pending AS
SELECT l.firm_id, l.po_id, l.id AS po_line_id, l.item_id, l.colour, l.size,
       l.qty AS ordered,
       COALESCE(r.received, 0) AS received,
       l.qty - COALESCE(r.received, 0) AS pending
  FROM mfg.purchase_order_lines l
  LEFT JOIN (
        SELECT po_line_id, SUM(qty) AS received
          FROM mfg.purchase_inward_lines
         WHERE po_line_id IS NOT NULL
         GROUP BY po_line_id
  ) r ON r.po_line_id = l.id;

-- ----------------------------------------------------------------------------
-- 3. PURCHASE RETURN — maal wapas bheja (DEBIT note)
--    Sales Return ka ULTA: wahan hum credit dete hain, yahan hum paisa
--    wapas MAANGTE hain.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.purchase_returns (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id     UUID NOT NULL REFERENCES mfg.godowns(id),
    dn_no         TEXT NOT NULL,          -- debit note number
    party_id      UUID NOT NULL,
    inward_id     UUID REFERENCES mfg.purchase_inwards(id),
    return_date   DATE NOT NULL DEFAULT current_date,
    reason        TEXT,
    note          TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS preturn_firm_no_uq ON mfg.purchase_returns (firm_id, dn_no);

CREATE TABLE IF NOT EXISTS mfg.purchase_return_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    return_id   UUID NOT NULL REFERENCES mfg.purchase_returns(id) ON DELETE CASCADE,
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    size        TEXT,
    qty         NUMERIC(14,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Meter',
    rate        NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS preturn_lines_ix ON mfg.purchase_return_lines (return_id);

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'purchase_orders','purchase_order_lines',
    'purchase_inwards','purchase_inward_lines',
    'purchase_returns','purchase_return_lines'
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

-- App-user ko haq (schema postgres se bana ho to) — 121 wali hi baat
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA mfg TO namokara_app';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA mfg TO namokara_app';
  END IF;
END $$;

SELECT core.assert_rls_policies(ARRAY['mfg']);
SELECT 'manufacturer purchase tayyar ✓' AS status;
