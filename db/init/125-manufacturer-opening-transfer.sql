-- ============================================================================
-- 125: MANUFACTURER — Opening Stock + Stock Transfer
-- ============================================================================
-- Ye do cheezein stock ke ginti-chakr ka aakhri hissa hain:
--
--   OPENING  — app shuru karne se PEHLE jo maal pada tha. Iske bina har purana
--              maal minus me chala jata hai (Chanderi -360 wali wahi dikkat):
--              job slip usse bahar bhejta hai, par andar wo kabhi aaya hi nahi.
--   TRANSFER — maal ek godown se doosre me. Do entry banti hain — nikalne wale
--              se ghata, aane wale me jama. Kul stock waisa ka waisa.
--
-- Dono ka apna kaagaz hai (sirf ledger row nahi) taaki baad me dekha ja sake
-- ki kya-kya daala tha, aur galti ho to poori entry hataayi ja sake.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. OPENING STOCK
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.opening_stocks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id    UUID NOT NULL REFERENCES mfg.godowns(id),
    entry_no     TEXT NOT NULL,
    -- Kis din ka stock hai. Aam taur par FY ki 1 April ya app shuru karne ka din
    as_on        DATE NOT NULL DEFAULT current_date,
    note         TEXT,
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS opening_firm_no_uq ON mfg.opening_stocks (firm_id, entry_no);
CREATE INDEX IF NOT EXISTS opening_godown_ix ON mfg.opening_stocks (firm_id, godown_id);

CREATE TABLE IF NOT EXISTS mfg.opening_stock_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    opening_id  UUID NOT NULL REFERENCES mfg.opening_stocks(id) ON DELETE CASCADE,
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    size        TEXT,
    qty         NUMERIC(14,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Pcs',
    -- Daam sirf hisaab ke liye — stock ki value nikalne me. Ledger qty par chalta hai.
    rate        NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS opening_lines_ix ON mfg.opening_stock_lines (opening_id);

-- ----------------------------------------------------------------------------
-- 2. STOCK TRANSFER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.stock_transfers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id        UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    transfer_no    TEXT NOT NULL,
    from_godown_id UUID NOT NULL REFERENCES mfg.godowns(id),
    to_godown_id   UUID NOT NULL REFERENCES mfg.godowns(id),
    transfer_date  DATE NOT NULL DEFAULT current_date,
    -- Raste ka hisaab — do jagah ke beech maal gaadi se hi jata hai
    transport      TEXT,
    lr_no          TEXT,
    vehicle_no     TEXT,
    note           TEXT,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Apne hi godown me transfer ka koi matlab nahi — DB par hi rok
    CONSTRAINT transfer_alag_godown CHECK (from_godown_id <> to_godown_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS transfer_firm_no_uq ON mfg.stock_transfers (firm_id, transfer_no);
CREATE INDEX IF NOT EXISTS transfer_from_ix ON mfg.stock_transfers (firm_id, from_godown_id);

CREATE TABLE IF NOT EXISTS mfg.stock_transfer_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    transfer_id UUID NOT NULL REFERENCES mfg.stock_transfers(id) ON DELETE CASCADE,
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    size        TEXT,
    qty         NUMERIC(14,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Pcs'
);
CREATE INDEX IF NOT EXISTS transfer_lines_ix ON mfg.stock_transfer_lines (transfer_id);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'opening_stocks','opening_stock_lines',
    'stock_transfers','stock_transfer_lines'
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
SELECT 'opening stock + stock transfer tayyar ✓' AS status;
