-- ============================================================================
-- 130: LOGISTICS — neev (schema, gaadi, driver, GR)
-- ============================================================================
-- Chautha app: transport company ka apna. Dhaancha wahi jo agency aur mfg ka
-- hai — ek hi DB, apna schema, har table par RLS, document number counter se.
--
-- PARTY DOBARA NAHI BANAYI. Consignor aur consignee dono `trading.party_profiles`
-- + `core.contacts` se aate hain — wahi jo agency aur manufacturer use karte
-- hain. Alag list banate to:
--   · ek hi vyapari teen jagah teen baar bharna padta
--   · Credil (jo GST par network score banati hai) me transport ki party
--     dikhti hi nahi — aur wahi is platform ka sabse bada faayda hai
--
-- GR (Goods Receipt) is app ka dil hai. Baaki sab kaagaz — loading sheet,
-- dispatch challan, inward, delivery receipt, TBB bill — isi ke ird-gird hain.
-- Isliye pehle yahi, baaki aage ke migration me.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS logistics;

-- ----------------------------------------------------------------------------
-- 1. GAADI (fleet)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.vehicles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    vehicle_no    TEXT NOT NULL,
    -- truck | tempo | container | trailer | pickup
    kind          TEXT NOT NULL DEFAULT 'truck',
    capacity_kg   NUMERIC(12,2),
    -- Apni gaadi hai ya kiraye ki — bhada aur hisaab dono me farak padta hai
    is_own        BOOLEAN NOT NULL DEFAULT TRUE,
    owner_name    TEXT,
    owner_mobile  TEXT,

    -- Kaagaz kab tak ke hain. Dashboard inhi se chetavni deta hai —
    -- gaadi raste me pakdi jaye to poora maal atak jata hai.
    insurance_till DATE,
    fitness_till   DATE,
    permit_till    DATE,
    puc_till       DATE,

    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    note          TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Ek firm me ek gaadi number do baar nahi (chhota-bada akshar bhi ek hi maana)
CREATE UNIQUE INDEX IF NOT EXISTS veh_firm_no_uq
    ON logistics.vehicles (firm_id, upper(replace(vehicle_no, ' ', '')));

-- ----------------------------------------------------------------------------
-- 2. DRIVER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.drivers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    mobile       TEXT NOT NULL,
    licence_no   TEXT,
    licence_till DATE,
    address      TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drv_firm_mobile_uq ON logistics.drivers (firm_id, mobile);

-- ----------------------------------------------------------------------------
-- 3. GR — Goods Receipt. Is app ka dil.
--
--    ⚠️ Naam ka dhyaan: agency app me bhi "GR" hai, par wahan uska matlab
--       GOODS RETURN hai (trading.goods_returns — maal wapas aana). Yahan GR
--       ka matlab GOODS RECEIPT hai — transport ka bhejne wala kaagaz.
--       Schema alag hai isliye takraav nahi, par code padhte waqt yaad rakhna.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.grs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    branch_id     UUID REFERENCES core.branches(id),
    gr_no         TEXT NOT NULL,
    gr_date       DATE NOT NULL DEFAULT current_date,

    -- Jisne bheja / jisko jaana hai. Dono trading.party_profiles se.
    consignor_id  UUID NOT NULL,
    consignee_id  UUID NOT NULL,
    -- Bill kisko jayega — teesra bhi ho sakta hai (aam baat hai)
    bill_party_id UUID,

    from_city     TEXT NOT NULL,
    to_city       TEXT NOT NULL,
    goods         TEXT,
    boxes         INT NOT NULL DEFAULT 0,
    weight_kg     NUMERIC(12,3) NOT NULL DEFAULT 0,
    -- Bhada kis par — weight ya boxes. Dono chalte hain, isliye likh kar rakhte hain.
    rate_basis    TEXT NOT NULL DEFAULT 'kg' CHECK (rate_basis IN ('kg','box','fixed')),
    rate          NUMERIC(12,2) NOT NULL DEFAULT 0,

    freight       NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
    gst           NUMERIC(14,2) NOT NULL DEFAULT 0,
    total         NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- paid   = bhejne wale ne diya
    -- topay  = lene wala dega
    -- tbb    = mahine ka bill banega (To Be Billed)
    -- cod    = maal ke saath paisa bhi lena hai
    pay_type      TEXT NOT NULL DEFAULT 'topay'
                  CHECK (pay_type IN ('paid','topay','tbb','cod')),
    cod_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- booked → loaded → in_transit → arrived → out_for_delivery → delivered
    -- (cancelled alag) — har padaav ka apna kaagaz hai
    status        TEXT NOT NULL DEFAULT 'booked'
                  CHECK (status IN ('booked','loaded','in_transit','arrived',
                                    'out_for_delivery','delivered','cancelled')),

    eway_bill_no  TEXT,
    eway_till     DATE,
    invoice_no    TEXT,          -- grahak ke maal ka apna bill number
    invoice_value NUMERIC(14,2),
    delivered_at  DATE,
    pod_photo     TEXT,
    pod_received_by TEXT,
    note          TEXT,

    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gr_firm_no_uq ON logistics.grs (firm_id, gr_no);
-- Roz ka sabse aam sawaal: "kaunsa maal abhi raste me hai"
CREATE INDEX IF NOT EXISTS gr_chal_rahe_ix
    ON logistics.grs (firm_id, status) WHERE status <> 'delivered' AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS gr_party_ix ON logistics.grs (firm_id, consignor_id);
CREATE INDEX IF NOT EXISTS gr_route_ix ON logistics.grs (firm_id, from_city, to_city);

-- ----------------------------------------------------------------------------
-- 4. GR ki lines — ek GR me kai kism ka maal ho sakta hai
--    (chhoti transport ek hi line likhti hai; badi ke yahan alag-alag article)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.gr_lines (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    gr_id      UUID NOT NULL REFERENCES logistics.grs(id) ON DELETE CASCADE,
    goods      TEXT NOT NULL,
    packing    TEXT,                    -- bora, gathar, carton, than
    boxes      INT NOT NULL DEFAULT 0,
    weight_kg  NUMERIC(12,3) NOT NULL DEFAULT 0,
    rate       NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount     NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS gr_lines_ix ON logistics.gr_lines (gr_id);

-- ----------------------------------------------------------------------------
-- 5. GR ki chaal — har padaav ka nishaan
--    Alag table isliye ki "kab kya hua" ka poora itihaas bache. Sirf status
--    badalte to grahak ke poochhne par kuch bata hi nahi paate.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.gr_events (
    id         BIGSERIAL PRIMARY KEY,
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    gr_id      UUID NOT NULL REFERENCES logistics.grs(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    place      TEXT,
    note       TEXT,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID
);
CREATE INDEX IF NOT EXISTS gr_events_ix ON logistics.gr_events (gr_id, happened_at);

-- ----------------------------------------------------------------------------
-- 6. RLS — har table par, bina chhode
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicles','drivers','grs','gr_lines','gr_events'] LOOP
    EXECUTE format('ALTER TABLE logistics.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE logistics.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON logistics.%I', t || '_firm_iso', t);
    EXECUTE format(
      'CREATE POLICY %I ON logistics.%I
         USING (firm_id = core.current_firm_id()
                OR current_setting(''app.is_platform_admin'', true) = ''true'')
         WITH CHECK (firm_id = core.current_firm_id()
                OR current_setting(''app.is_platform_admin'', true) = ''true'')',
      t || '_firm_iso', t);
  END LOOP;
END $$;

-- Schema postgres se bana hai, app `namokara_app` se judti hai — 121 wali seekh
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA logistics TO namokara_app';
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA logistics TO namokara_app';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA logistics TO namokara_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA logistics
             GRANT ALL ON TABLES TO namokara_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA logistics
             GRANT ALL ON SEQUENCES TO namokara_app';
  END IF;
END $$;

SELECT core.assert_rls_policies(ARRAY['logistics']);
SELECT 'logistics ki neev tayyar ✓' AS status;
