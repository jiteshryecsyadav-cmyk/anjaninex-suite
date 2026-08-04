-- ============================================================================
-- 118: MANUFACTURER — job slip, taka, stock ledger
-- ============================================================================
-- Job slip manufacturer ka asli kaagaz hai. Do hisse hote hain:
--   MATERIAL — karigar ko KYA DIYA (rang, qty, taka)
--   PROGRAM  — usse KYA BANANA hai (design, hissa, ratio, size-wise)
-- Dono milane se pata chalta hai ki kitna maal bahar gaya aur kitna wapas
-- aana baki hai. Iske bina maal karigar ke paas atka reh jata hai aur
-- mahino baad pata chalta hai.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. JOB SLIP
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.job_slips (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id        UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id      UUID REFERENCES mfg.godowns(id),
    -- ReserveCounterAsync se. MAX(no)+1 kabhi nahi — do aadmi ek saath
    -- slip banayenge to dono ko wahi number milega.
    slip_no        TEXT NOT NULL,
    lot_no         TEXT,
    karigar_id     UUID NOT NULL REFERENCES mfg.karigars(id),
    job_type       TEXT NOT NULL,
    -- Kis order ke liye ban raha hai. Khali bhi ho sakta hai — stock ke liye
    -- bhi maal banwaya jata hai.
    sales_order_id UUID,
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at         DATE,
    status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','partial','done','cancelled')),
    note           TEXT,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_slips_firm_no_uq
    ON mfg.job_slips (firm_id, slip_no);
-- "Kis karigar ke paas kitna atka hai" — sabse zyada poocha jane wala sawal
CREATE INDEX IF NOT EXISTS job_slips_open_ix
    ON mfg.job_slips (firm_id, karigar_id) WHERE status IN ('open','partial');

-- Karigar ko KYA DIYA
CREATE TABLE IF NOT EXISTS mfg.job_slip_materials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    job_slip_id UUID NOT NULL REFERENCES mfg.job_slips(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES trading.items(id),
    colour      TEXT,
    qty         NUMERIC(12,3) NOT NULL CHECK (qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Meter'
);
CREATE INDEX IF NOT EXISTS js_materials_slip_ix
    ON mfg.job_slip_materials (job_slip_id);

-- Karigar ko KYA BANANA hai
CREATE TABLE IF NOT EXISTS mfg.job_slip_programs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    job_slip_id UUID NOT NULL REFERENCES mfg.job_slips(id) ON DELETE CASCADE,
    design_id   UUID NOT NULL REFERENCES trading.items(id),
    part        TEXT NOT NULL,
    job_rate    NUMERIC(12,2) NOT NULL DEFAULT 0,
    rate_unit   TEXT NOT NULL DEFAULT 'Pcs'
);
CREATE INDEX IF NOT EXISTS js_programs_slip_ix
    ON mfg.job_slip_programs (job_slip_id);

-- RATIO — "S ka 1, M ka 1, L ka 2" wala hisab.
-- Karigar ko kul piece aur ratio batao; kaunse size ke kitne banenge wo app
-- khud baant deti hai (160 piece, 1:1:2 → 40 / 40 / 80). Pehle ye ek line me
-- likhwate the aur likhne me hi galti ho jati thi.
CREATE TABLE IF NOT EXISTS mfg.job_slip_ratios (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES mfg.job_slip_programs(id) ON DELETE CASCADE,
    size       TEXT NOT NULL,
    ratio      INT  NOT NULL CHECK (ratio > 0),
    UNIQUE (program_id, size)
);

CREATE TABLE IF NOT EXISTS mfg.job_slip_program_sizes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES mfg.job_slip_programs(id) ON DELETE CASCADE,
    size       TEXT NOT NULL,
    colour     TEXT,
    qty        INT NOT NULL DEFAULT 0 CHECK (qty >= 0)
);
CREATE INDEX IF NOT EXISTS js_prog_sizes_ix
    ON mfg.job_slip_program_sizes (program_id);

-- Karigar se maal WAPAS aaya
CREATE TABLE IF NOT EXISTS mfg.job_slip_receipts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    job_slip_id  UUID NOT NULL REFERENCES mfg.job_slips(id) ON DELETE CASCADE,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    design_id    UUID REFERENCES trading.items(id),
    size         TEXT,
    colour       TEXT,
    qty          INT NOT NULL CHECK (qty >= 0),
    -- Kharab nikla maal alag ginte hain — iski majoori nahi banti
    rejected_qty INT NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
    note         TEXT,
    photo_url    TEXT,
    created_by   UUID
);
CREATE INDEX IF NOT EXISTS js_receipts_slip_ix
    ON mfg.job_slip_receipts (job_slip_id);

-- Kis karigar ke paas kitna maal aur kitni majoori atki hai.
-- Karigar Khata Book aur "Track Jobslip Lots" — dono isi par bante hain.
CREATE OR REPLACE VIEW mfg.v_karigar_pending AS
SELECT s.firm_id,
       s.karigar_id,
       s.id                        AS job_slip_id,
       s.slip_no,
       s.lot_no,
       s.issued_at,
       s.due_at,
       COALESCE(p.banane_hain, 0)  AS banane_hain,
       COALESCE(r.aaye, 0)         AS aaye,
       COALESCE(r.kharab, 0)       AS kharab,
       COALESCE(p.banane_hain, 0) - COALESCE(r.aaye, 0) AS baki,
       COALESCE(r.majoori, 0)      AS majoori_bani
  FROM mfg.job_slips s
  LEFT JOIN (
        SELECT pr.job_slip_id, SUM(ps.qty) AS banane_hain
          FROM mfg.job_slip_programs pr
          JOIN mfg.job_slip_program_sizes ps ON ps.program_id = pr.id
         GROUP BY pr.job_slip_id
  ) p ON p.job_slip_id = s.id
  LEFT JOIN (
        SELECT rc.job_slip_id,
               SUM(rc.qty)          AS aaye,
               SUM(rc.rejected_qty) AS kharab,
               -- Majoori sirf SAHI maal par. Kharab nikle piece par nahi.
               SUM(rc.qty * COALESCE(
                     (SELECT pr2.job_rate FROM mfg.job_slip_programs pr2
                       WHERE pr2.job_slip_id = rc.job_slip_id
                         AND pr2.design_id   = rc.design_id
                       LIMIT 1), 0)) AS majoori
          FROM mfg.job_slip_receipts rc
         GROUP BY rc.job_slip_id
  ) r ON r.job_slip_id = s.id
 WHERE s.status IN ('open','partial');

-- ----------------------------------------------------------------------------
-- 2. TAKA (than) — har kapde ka apna meter
--
-- Taka challan, job slip, purchase inward aur PO — chaaron jagah aata hai.
-- Chaar alag table banate to wahi code chaar baar likhna padta aur ek jagah
-- sudhaar karke teen jagah bhool jate.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.takas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL
               CHECK (owner_type IN
                 ('challan_line','jobslip_material','inward_line','po_material')),
    owner_id   UUID NOT NULL,
    seq        INT  NOT NULL CHECK (seq > 0),      -- 1, 2, 3… kaunsa taka
    meters     NUMERIC(10,2) NOT NULL CHECK (meters > 0),
    UNIQUE (owner_type, owner_id, seq)
);
CREATE INDEX IF NOT EXISTS takas_owner_ix ON mfg.takas (owner_type, owner_id);

-- ----------------------------------------------------------------------------
-- 3. STOCK LEDGER
--
-- Stock ko kabhi ek column me mat rakhna. Ek column rakhte to "stock 40 dikha
-- raha hai par godown me 12 hai" wali haalat aati aur wajah kabhi nahi milti.
-- Ledger se hamesha peeche jaakar dekh sakte hain ki kis kagaz se kya hua.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.stock_ledger (
    id          BIGSERIAL PRIMARY KEY,
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    godown_id   UUID NOT NULL REFERENCES mfg.godowns(id),
    item_id     UUID NOT NULL REFERENCES trading.items(id),
    item_kind   TEXT NOT NULL CHECK (item_kind IN ('design','material')),
    colour      TEXT,
    size        TEXT,
    qty_in      NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_in  >= 0),
    qty_out     NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_out >= 0),
    -- Kis kagaz se hua
    ref_type    TEXT NOT NULL
                CHECK (ref_type IN ('opening','challan','inward','jobslip',
                                    'receipt','transfer','sreturn','preturn','adjust')),
    ref_id      UUID NOT NULL,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID
);
CREATE INDEX IF NOT EXISTS stock_ledger_lookup_ix
    ON mfg.stock_ledger (firm_id, godown_id, item_id, colour, size);
CREATE INDEX IF NOT EXISTS stock_ledger_ref_ix
    ON mfg.stock_ledger (ref_type, ref_id);

-- Abhi kitna maal hai — hamesha ledger se joda hua
CREATE OR REPLACE VIEW mfg.v_stock_on_hand AS
SELECT firm_id, godown_id, item_id, item_kind, colour, size,
       SUM(qty_in) - SUM(qty_out) AS on_hand
  FROM mfg.stock_ledger
 GROUP BY firm_id, godown_id, item_id, item_kind, colour, size;

-- Kaunsa maal khatam hone wala hai
CREATE OR REPLACE VIEW mfg.v_stock_low AS
SELECT h.firm_id, h.godown_id, h.item_id, i.name, i.item_kind,
       SUM(h.on_hand) AS on_hand, i.min_stock_qty
  FROM mfg.v_stock_on_hand h
  JOIN trading.items i ON i.id = h.item_id
 WHERE i.min_stock_qty IS NOT NULL
 GROUP BY h.firm_id, h.godown_id, h.item_id, i.name, i.item_kind, i.min_stock_qty
HAVING SUM(h.on_hand) < i.min_stock_qty;

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'job_slips','job_slip_materials','job_slip_programs','job_slip_ratios',
    'job_slip_program_sizes','job_slip_receipts','takas','stock_ledger'
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

SELECT core.assert_rls_policies(ARRAY['mfg']);

SELECT 'manufacturer jobslip/stock tayyar ✓' AS status;
