-- ============================================================================
-- Migration 54 — SALES-side vouchers ka PARTY line SUPPLIER se BUYER pe le aao
-- ----------------------------------------------------------------------------
-- BUG (confirmed): SALES bill ka auto-voucher GALAT party ko Dr karta tha.
--   Broker model me ek bill par DO party hoti hain:
--     bills.party_id        = SUPPLIER (jisne maal bheja)
--     bills.buyer_party_id  = BUYER    (jisne kharida — customer)
--   SALES ka DEBTOR (receivable) BUYER hota hai, supplier nahi. Par code pehle
--   hamesha party_id (supplier) ka ledger Dr karta tha → buyer khata khaali,
--   supplier ke khate me galat sale chadhi.
--
-- Code fix deploy ho chuka (BillService / GoodsReturnService / PaymentService).
-- Yeh script PURANE (historical) sales-side vouchers ko theek karta hai: har
-- aise voucher ki PARTY line ka ledger_id supplier_ledger se buyer_ledger pe
-- shift karta hai. Amount aur Dr/Cr same rehte hain → voucher balanced hi
-- rehta hai (Dr=Cr trigger fire nahi hota).
--
-- KAUNSE vouchers:
--   1. SALES bill voucher        (bills.voucher_id)               — Dr party line
--   2. SALES GR ka sales_return  (goods_returns.voucher_id)       — Cr party line
--   3. SALES bill ka receipt     (payment_allocations → bill)     — Cr party line
--   (purchase ko HAATH NAHI lagana — wo party_id/supplier hi sahi hai.)
--
-- SAFE + IDEMPOTENT:
--   * Sirf SALES bills jinka buyer_party_id NOT NULL aur voucher_id NOT NULL.
--   * Buyer ka ledger na mile to wo bill SKIP (RAISE NOTICE).
--   * Sirf wahi voucher_lines badalti hain jinka ledger_id = us bill ka
--     SUPPLIER ledger (party_id ka ledger). Isse Sales / GST / Cash / Bank /
--     Round-Off lines bilkul nahi chhedti — sirf galat party line shift hoti.
--   * Dobara chalane par kuch nahi badlega (supplier line ab hai hi nahi).
--
-- postgres (superuser) ke roop me chalao — RLS firm-scoped WHERE se bypass.
-- ============================================================================

DO $$
DECLARE
    b              RECORD;
    v_supplier_led UUID;          -- accounting.ledgers.id for bill.party_id (supplier)
    v_buyer_led    UUID;          -- accounting.ledgers.id for bill.buyer_party_id (buyer)
    n_rows         INT;
    n_bill_v       INT := 0;      -- bill vouchers fixed
    n_gr_v         INT := 0;      -- sales-return (GR) vouchers fixed
    n_pay_v        INT := 0;      -- receipt vouchers fixed
    n_skip         INT := 0;      -- buyer ledger missing → skipped
BEGIN
    FOR b IN
        SELECT id            AS bill_id,
               firm_id       AS firm_id,
               party_id      AS supplier_pp,    -- party_profiles.id (supplier)
               buyer_party_id AS buyer_pp,      -- party_profiles.id (buyer)
               voucher_id    AS bill_voucher
        FROM   trading.bills
        WHERE  bill_type = 'sales'
          AND  buyer_party_id IS NOT NULL
          AND  voucher_id IS NOT NULL
    LOOP
        -- supplier + buyer ke ledgers nikalo
        SELECT ledger_id INTO v_supplier_led
        FROM   trading.party_profiles
        WHERE  id = b.supplier_pp AND firm_id = b.firm_id;

        SELECT ledger_id INTO v_buyer_led
        FROM   trading.party_profiles
        WHERE  id = b.buyer_pp AND firm_id = b.firm_id;

        -- buyer ka ledger hi nahi → is bill ko theek nahi kar sakte
        IF v_buyer_led IS NULL THEN
            RAISE NOTICE 'SKIP bill %: buyer party % ka ledger nahi mila', b.bill_id, b.buyer_pp;
            n_skip := n_skip + 1;
            CONTINUE;
        END IF;

        -- supplier ledger missing (ya supplier==buyer) → kuch shift karne ko nahi
        IF v_supplier_led IS NULL OR v_supplier_led = v_buyer_led THEN
            CONTINUE;
        END IF;

        -- 1) SALES BILL voucher ki party line (Dr supplier → Dr buyer)
        UPDATE accounting.voucher_lines
        SET    ledger_id = v_buyer_led
        WHERE  voucher_id = b.bill_voucher
          AND  ledger_id  = v_supplier_led;
        GET DIAGNOSTICS n_rows = ROW_COUNT;
        IF n_rows > 0 THEN
            n_bill_v := n_bill_v + 1;
        END IF;

        -- 2) Is SALES bill ke GR (sales_return) vouchers ki party line
        --    (Cr supplier → Cr buyer). GR → bill linkage: original_bill_id.
        UPDATE accounting.voucher_lines vl
        SET    ledger_id = v_buyer_led
        FROM   trading.goods_returns gr
        WHERE  gr.original_bill_id = b.bill_id
          AND  gr.firm_id         = b.firm_id
          AND  gr.voucher_id IS NOT NULL
          AND  vl.voucher_id = gr.voucher_id
          AND  vl.ledger_id  = v_supplier_led;
        GET DIAGNOSTICS n_rows = ROW_COUNT;
        IF n_rows > 0 THEN
            n_gr_v := n_gr_v + n_rows;
        END IF;

        -- 3) Is SALES bill ke receipt (payment) vouchers ki party line
        --    (Cr supplier → Cr buyer). payment → bill linkage: payment_allocations.
        --    Sirf wahi lines jinka ledger_id = is bill ka supplier ledger; multi-bill
        --    payment me doosri bills ki lines (alag ledger) untouched rehti hain.
        UPDATE accounting.voucher_lines vl
        SET    ledger_id = v_buyer_led
        FROM   trading.payments p
        JOIN   trading.payment_allocations a ON a.payment_id = p.id
        WHERE  a.bill_id = b.bill_id
          AND  p.firm_id = b.firm_id
          AND  p.voucher_id IS NOT NULL
          AND  vl.voucher_id = p.voucher_id
          AND  vl.ledger_id  = v_supplier_led;
        GET DIAGNOSTICS n_rows = ROW_COUNT;
        IF n_rows > 0 THEN
            n_pay_v := n_pay_v + n_rows;
        END IF;
    END LOOP;

    RAISE NOTICE '54-fix-sales-voucher-buyer-ledger: bill vouchers fixed=%, GR(sales_return) lines fixed=%, receipt lines fixed=%, bills skipped (no buyer ledger)=%',
        n_bill_v, n_gr_v, n_pay_v, n_skip;
END $$;

-- ============================================================================
-- VERIFY — fix ke baad koi bhi SALES-side voucher ki party line ab SUPPLIER
-- ledger par nahi honi chahiye (jab buyer ledger maujood ho). Ye query un
-- "ab bhi galat" lines ko dikhaati hai — IDEAL result = 0 rows.
-- (Jin bills ka buyer ledger hi nahi tha, wo yahan aa sakte hain — unhe pehle
--  Chart of Accounts me buyer ka ledger banakar dobara chalao.)
-- ============================================================================
SELECT
    'still_on_supplier_ledger' AS check_name,
    v.voucher_type,
    count(*)                   AS line_count
FROM   trading.bills b
JOIN   trading.party_profiles sup  ON sup.id  = b.party_id        AND sup.firm_id  = b.firm_id
JOIN   trading.party_profiles buy  ON buy.id  = b.buyer_party_id  AND buy.firm_id  = b.firm_id
JOIN   accounting.voucher_lines vl ON vl.ledger_id = sup.ledger_id
JOIN   accounting.vouchers v       ON v.id = vl.voucher_id
WHERE  b.bill_type = 'sales'
  AND  b.buyer_party_id IS NOT NULL
  AND  buy.ledger_id IS NOT NULL
  AND  sup.ledger_id IS NOT NULL
  AND  sup.ledger_id <> buy.ledger_id
  AND  v.voucher_type IN ('sales','sales_return','receipt')
  AND  (
        v.id = b.voucher_id                                                   -- bill voucher
     OR v.id IN (SELECT gr.voucher_id FROM trading.goods_returns gr
                 WHERE gr.original_bill_id = b.id AND gr.firm_id = b.firm_id)  -- GR voucher
     OR v.id IN (SELECT p.voucher_id FROM trading.payments p
                 JOIN trading.payment_allocations a ON a.payment_id = p.id
                 WHERE a.bill_id = b.id AND p.firm_id = b.firm_id)            -- receipt voucher
      )
GROUP BY v.voucher_type
ORDER BY v.voucher_type;

SELECT 'migration 54-fix-sales-voucher-buyer-ledger complete' AS status;
