-- ============================================================================
-- 126: MANUFACTURER — Karigar ko majoori ka bhugtan
-- ============================================================================
-- Job slip se ye to pata chal jata hai ki karigar ki majoori KITNI BANI —
-- par ye kahin nahi tha ki usko DIYA kitna. Bina iske "kiska kitna bakaya
-- hai" ka jawab hi nahi milta, aur karkhane me sabse zyada jhagda isi baat
-- par hota hai.
--
-- Khata ka hisaab:
--     BANI (job slip receipts se)  −  DIYA (ye table)  =  BAKAYA
--
-- Advance bhi isi table me jaata hai (kaam se pehle diya paisa) — bas
-- `is_advance` sach hota hai. Alag table banane ki zarurat nahi: hisaab
-- dono ka ek hi hai, sirf kab diya wo alag hai.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mfg.karigar_payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    karigar_id   UUID NOT NULL REFERENCES mfg.karigars(id),
    payment_no   TEXT NOT NULL,
    paid_on      DATE NOT NULL DEFAULT current_date,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),

    /** cash | bank | upi | cheque */
    mode         TEXT NOT NULL DEFAULT 'cash'
                 CHECK (mode IN ('cash','bank','upi','cheque')),
    -- Cheque number / UPI ref / bank ka transaction no.
    ref_no       TEXT,

    -- Kaam se PEHLE diya paisa. Hisaab wahi hai, sirf kab diya wo alag hai.
    is_advance   BOOLEAN NOT NULL DEFAULT FALSE,

    -- Kis slip ke against — khali bhi chhod sakte hain (mahine ka hisaab)
    job_slip_id  UUID REFERENCES mfg.job_slips(id) ON DELETE SET NULL,
    note         TEXT,

    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kpay_firm_no_uq ON mfg.karigar_payments (firm_id, payment_no);
CREATE INDEX IF NOT EXISTS kpay_karigar_ix ON mfg.karigar_payments (firm_id, karigar_id, paid_on);

-- ----------------------------------------------------------------------------
-- KHATA — har karigar ka ek line ka hisaab
--
-- Majoori sirf ACHHE piece par banti hai. Kharab nikle maal ki majoori nahi
-- milti — ye niyam pehle se `v_karigar_pending` me hai, wahi yahan bhi.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW mfg.v_karigar_khata AS
WITH bani AS (
    SELECT s.firm_id, s.karigar_id,
           SUM(r.qty * p.job_rate) AS majoori_bani,
           SUM(r.qty)              AS achhe_piece,
           SUM(r.rejected_qty)     AS kharab_piece
      FROM mfg.job_slip_receipts r
      JOIN mfg.job_slips s ON s.id = r.job_slip_id
      -- Ek slip me kai program (design × hissa) ho sakte hain. Receipt jis
      -- design ka hai usi program ka rate lagta hai; design na likha ho to
      -- slip ka pehla program (aam taur par ek hi hota hai).
      LEFT JOIN LATERAL (
            SELECT pr.job_rate FROM mfg.job_slip_programs pr
             WHERE pr.job_slip_id = s.id
               AND (r.design_id IS NULL OR pr.design_id = r.design_id)
             ORDER BY pr.id LIMIT 1
      ) p ON TRUE
     GROUP BY s.firm_id, s.karigar_id
),
diya AS (
    SELECT firm_id, karigar_id,
           SUM(amount) FILTER (WHERE NOT is_advance) AS majoori_di,
           SUM(amount) FILTER (WHERE is_advance)     AS advance_diya,
           SUM(amount)                                AS kul_diya
      FROM mfg.karigar_payments
     GROUP BY firm_id, karigar_id
)
SELECT k.firm_id, k.id AS karigar_id, k.name, k.mobile, k.job_type, k.is_active,
       COALESCE(b.majoori_bani, 0) AS majoori_bani,
       COALESCE(b.achhe_piece, 0)  AS achhe_piece,
       COALESCE(b.kharab_piece, 0) AS kharab_piece,
       COALESCE(d.majoori_di, 0)   AS majoori_di,
       COALESCE(d.advance_diya, 0) AS advance_diya,
       COALESCE(d.kul_diya, 0)     AS kul_diya,
       COALESCE(b.majoori_bani, 0) - COALESCE(d.kul_diya, 0) AS bakaya
  FROM mfg.karigars k
  LEFT JOIN bani b ON b.karigar_id = k.id
  LEFT JOIN diya d ON d.karigar_id = k.id;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE mfg.karigar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfg.karigar_payments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS karigar_payments_firm_iso ON mfg.karigar_payments;
CREATE POLICY karigar_payments_firm_iso ON mfg.karigar_payments
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA mfg TO namokara_app';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA mfg TO namokara_app';
  END IF;
END $$;

SELECT core.assert_rls_policies(ARRAY['mfg']);
SELECT 'karigar khata tayyar ✓' AS status;
