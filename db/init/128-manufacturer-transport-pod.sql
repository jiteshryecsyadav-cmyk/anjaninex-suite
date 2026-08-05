-- ============================================================================
-- 128: MANUFACTURER — maal transport ko de diya, ab wo kahan hai?
-- ============================================================================
-- Challan par transport ka naam, LR aur gaadi pehle se likhte the — par uske
-- BAAD ka kuch nahi. Maal nikal gaya aur phir andhera: pahuncha ya nahi,
-- kisne liya, POD aayi ya nahi — kuch pata nahi.
--
-- Karkhane me sabse zyada phone isi baat ke ghumte hain: "wo Surat wala maal
-- pahuncha?" Ab challan khud jawab dega.
--
-- Halat ke chaar padaav — jaan-boojh kar kam rakhe hain. Zyada padaav rakhne
-- se koi update hi nahi karta aur poora hisaab jhootha ho jata hai:
--     bheja      — challan bana, maal godown se nikla
--     raste_me   — transporter ne utha liya (LR mil gayi)
--     pahuncha   — sheher pahunch gaya
--     mila       — grahak ne le liya, POD haath me hai
--
-- POD (Proof of Delivery) — kisne liya, kab liya, aur kaagaz ki photo. Yahi
-- wo cheez hai jo paisa maangte waqt kaam aati hai.
-- ============================================================================

ALTER TABLE mfg.delivery_challans
    ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'bheja',
    ADD COLUMN IF NOT EXISTS pod_photo       TEXT,
    ADD COLUMN IF NOT EXISTS pod_received_by TEXT,
    ADD COLUMN IF NOT EXISTS pod_at          DATE,
    ADD COLUMN IF NOT EXISTS pod_note        TEXT,
    -- Transporter ne apni taraf se kya LR number diya (hamare `lr_no` se alag
    -- ho sakta hai jab hum apna number likhte hain)
    ADD COLUMN IF NOT EXISTS transport_lr    TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dc_delivery_status_ck') THEN
        ALTER TABLE mfg.delivery_challans
          ADD CONSTRAINT dc_delivery_status_ck
          CHECK (delivery_status IN ('bheja','raste_me','pahuncha','mila'));
    END IF;
END $$;

-- Transport ke naam se dhoondhna aam kaam hai — "Kanha ka kitna maal raste me hai"
CREATE INDEX IF NOT EXISTS dc_transport_ix
    ON mfg.delivery_challans (firm_id, transport)
 WHERE transport IS NOT NULL;

-- Jinki POD abhi nahi aayi — screen sabse pehle yahi dikhati hai
CREATE INDEX IF NOT EXISTS dc_pod_baki_ix
    ON mfg.delivery_challans (firm_id, delivery_status)
 WHERE delivery_status <> 'mila';

COMMENT ON COLUMN mfg.delivery_challans.delivery_status IS
  'bheja | raste_me | pahuncha | mila — maal ab kahan hai';
COMMENT ON COLUMN mfg.delivery_challans.pod_photo IS
  'POD kaagaz ki photo ka object key (MinIO). Paisa maangte waqt yahi saboot hai.';

-- ----------------------------------------------------------------------------
-- Transport-wise ek nazar ka hisaab
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW mfg.v_transport_summary AS
SELECT c.firm_id,
       COALESCE(NULLIF(TRIM(c.transport), ''), '(transport nahi likha)') AS transport,
       count(*)                                                        AS challans,
       count(*) FILTER (WHERE c.delivery_status = 'bheja')             AS bheja,
       count(*) FILTER (WHERE c.delivery_status = 'raste_me')          AS raste_me,
       count(*) FILTER (WHERE c.delivery_status = 'pahuncha')          AS pahuncha,
       count(*) FILTER (WHERE c.delivery_status = 'mila')              AS mila,
       count(*) FILTER (WHERE c.delivery_status <> 'mila')             AS pod_baki,
       min(c.challan_date)                                             AS pehla,
       max(c.challan_date)                                             AS aakhri,
       COALESCE(SUM(l.qty), 0)                                         AS kul_maal,
       COALESCE(SUM(l.qty * l.rate), 0)                                AS kul_rakam
  FROM mfg.delivery_challans c
  LEFT JOIN mfg.delivery_challan_lines l ON l.dc_id = c.id
 GROUP BY c.firm_id, COALESCE(NULLIF(TRIM(c.transport), ''), '(transport nahi likha)');

SELECT core.assert_rls_policies(ARRAY['mfg']);
SELECT 'transport + POD tayyar ✓' AS status;
