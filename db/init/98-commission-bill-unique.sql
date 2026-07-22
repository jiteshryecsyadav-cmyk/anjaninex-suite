-- ============================================================================
-- 98: Ek bill ka commission sirf EK baar — DB-level rok
-- ============================================================================
-- DIKKAT: Generate par bane bills list me pade rehte the; dobara Generate
--   dabate hi wahi bills phir submit ho jate the → same invoice do baar
--   (Ho-C26/C27 jodi). Frontend filter sirf agle FETCH par lagta tha.
--
-- ILAAJ: unique index — DB khud rok dega, chahe request kahin se aaye.
--   Invoice DELETE hard hai + lines ON DELETE CASCADE — isliye invoice
--   delete karte hi bill dobara generate ho sakta hai (sahi behavior).
--
-- ⚠️ PEHLE SE PADE DUPLICATES index banne se rokte hain. Isliye:
--   1. Neeche wali query duplicates dikhati hai
--   2. Index tabhi banega jab duplicates saaf ho jayein — warna NOTICE ke
--      saath skip (app tootegi nahi, par rok bhi nahi lagegi)
--   Duplicates app se saaf karo: Commission list me jodi wale invoice
--   (jaise Ho-C27) par Delete dabao, phir ye file DOBARA chalao.

-- Kaunse bills ka commission ek se zyada invoice me hai:
SELECT l.bill_no, count(*) AS kitni_baar,
       array_agg(i.invoice_no ORDER BY i.created_at) AS invoices
  FROM trading.commission_invoice_lines l
  JOIN trading.commission_invoices i ON i.id = l.commission_invoice_id
 GROUP BY l.bill_id, l.bill_no
HAVING count(*) > 1;

DO $$
BEGIN
    CREATE UNIQUE INDEX uq_comm_inv_lines_bill
        ON trading.commission_invoice_lines (bill_id);
    RAISE NOTICE 'uq_comm_inv_lines_bill ban gaya — ab ek bill ka commission dobara NAHI banega ✓';
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index pehle se hai ✓';
    WHEN unique_violation THEN
        RAISE NOTICE 'DUPLICATES MAUJOOD — upar wali list ke extra invoices app se DELETE karo, phir ye file dobara chalao. (Rok abhi NAHI lagi.)';
END $$;

SELECT 'commission unique-bill migration done' AS status;
