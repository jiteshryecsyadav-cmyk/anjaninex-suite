-- 93: EK PAYMENT NUMBER — EK HI RECEIPT (duplicate rokne ke liye DB-level guard)
--
-- Kyun: HO-R2 do baar ban gaya (dono active). Wajah — receipt EDIT pehle
-- 'delete karo phir nayi banao' se hota tha aur nayi wali purana number
-- reuse karti thi. Beech me kuch bigda to ek adhoori/duplicate receipt
-- bach jati thi, aur DB me use rokne ke liye koi constraint tha hi nahi.
--
-- Code me ab asli UPDATE hai (delete+recreate hataya), par CODE par bharosa
-- kaafi nahi — paise ka record hai. DB khud mana kare, tabhi pakka hai.
--
-- PARTIAL index (deleted_at IS NULL): soft-deleted purane record number ko
-- block na karein, warna wahi number dobara istemal hi nahi ho payega.

-- ── Pehle dekho: koi duplicate bacha to hai? ──
DO $$
DECLARE dup_txt text;
BEGIN
    SELECT string_agg(format('%s (firm %s, %s baar)', payment_no, firm_id, cnt), E'\n  ')
      INTO dup_txt
    FROM (
        SELECT firm_id, payment_no, COUNT(*) AS cnt
        FROM trading.payments
        WHERE deleted_at IS NULL
        GROUP BY firm_id, payment_no
        HAVING COUNT(*) > 1
    ) d;

    IF dup_txt IS NOT NULL THEN
        RAISE EXCEPTION E'DUPLICATE PAYMENT NUMBER mile — index nahi banega.\n  %\n\nPehle inhe theek karo (galat wali receipt app se Delete karo), phir ye migration dobara chalao.', dup_txt;
    END IF;
END $$;

-- ── Saaf hai to rok laga do ──
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_firm_no_active
    ON trading.payments (firm_id, payment_no)
    WHERE deleted_at IS NULL;

SELECT 'payment no unique ✓' AS status;
