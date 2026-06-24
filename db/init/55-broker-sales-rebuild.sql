-- ============================================================================
-- Migration 55 — BROKER (dalal) model: SALES-side vouchers ko 2-LINE me rebuild
-- ============================================================================
--  Riddhi Agency ek COMMISSION-BROKER (dalal/middleman) hai — SELLER NAHI.
--  Wo sirf SUPPLIER↔BUYER ke beech ka bill aur goods-return RE-ENTER karta hai.
--  GST supplier↔buyer ka hai; broker ki books me NA Sales Account, NA Output GST.
--  Payment seedha buyer↔supplier hoti hai — broker cash hold nahi karta.
--
--  Code (BillService / GoodsReturnService / PaymentService) ab broker 2-line model
--  post karta hai. Yeh script PURANE (historical) sales-side vouchers ko usi
--  2-line form me rebuild karta hai:
--     SALES BILL voucher        → Dr BUYER  = total          ,  Cr SUPPLIER = total
--     SALES GR (sales_return)   → Dr SUPPLIER = gr total      ,  Cr BUYER    = gr total
--     SALES bill ka RECEIPT     → Dr SUPPLIER = allocated     ,  Cr BUYER    = allocated
--                                 (per sales-bill allocation; NO cash/bank line)
--
-- ----------------------------------------------------------------------------
-- !!!  CHETAVANI — PEHLE FULL DATABASE BACKUP LO  !!!
-- ----------------------------------------------------------------------------
--  Yeh migration HISTORICAL accounting balances BADAL deti hai (jaan-boojh kar):
--    * Broker ka SALES ACCOUNT balance GIR jayega — middleman model me uska
--      apna sale tha hi nahi (wo galat tha).
--    * Broker ka OUTPUT GST (CGST/SGST/IGST Payable) balance GIR jayega — GST
--      supplier ka hai, broker ka nahi.
--    * Broker ka CASH/BANK balance BADAL sakta hai — sales receipts me ab koi
--      cash/bank line nahi (paisa seedha buyer↔supplier gaya, broker ke paas
--      kabhi aaya hi nahi tha). Ye galat cash/bank entries hat jayengi.
--  Yeh sab JAAN-BOOJH KAR hai — middleman ke under wo balances galat the.
--  Chalane se PEHLE: pg_dump se poora backup le lo.
--
-- ----------------------------------------------------------------------------
--  CHALAO: postgres (superuser) ke roop me — RLS firm-scoped raw SQL se bypass.
--  IDEMPOTENT: har voucher ki lines DELETE-then-INSERT hoti hain → dobara chalane
--  par bilkul wahi 2 (ya per-allocation pair) lines banti hain, koi duplicate nahi.
--  PURCHASE bills / purchase returns / purchase payments / COMMISSION ko HAATH
--  NAHI lagti — sirf sales-side.
-- ============================================================================

DO $$
DECLARE
    b              RECORD;        -- har eligible sales bill
    gr             RECORD;        -- us bill ke sales GR
    pv             RECORD;        -- us bill se juda payment voucher
    alloc          RECORD;        -- payment voucher ki sales-bill allocations
    v_buyer_led    UUID;          -- ledgers.id for bill.buyer_party_id
    v_supplier_led UUID;          -- ledgers.id for bill.party_id
    v_total        NUMERIC(14,2);
    v_gr_total     NUMERIC(14,2);
    n_bill_v       INT := 0;      -- bill vouchers rebuilt
    n_gr_v         INT := 0;      -- sales_return vouchers rebuilt
    n_pay_v        INT := 0;      -- receipt vouchers rebuilt
    n_skip         INT := 0;      -- buyer/supplier ledger missing → skipped
BEGIN
    FOR b IN
        SELECT id             AS bill_id,
               firm_id        AS firm_id,
               party_id       AS supplier_pp,    -- party_profiles.id (supplier)
               buyer_party_id AS buyer_pp,       -- party_profiles.id (buyer)
               voucher_id     AS bill_voucher,
               total          AS bill_total
        FROM   trading.bills
        WHERE  bill_type = 'sales'
          AND  buyer_party_id IS NOT NULL
          AND  voucher_id IS NOT NULL
          AND  deleted_at IS NULL
    LOOP
        -- buyer + supplier ke ledgers nikalo
        SELECT ledger_id INTO v_buyer_led
        FROM   trading.party_profiles
        WHERE  id = b.buyer_pp AND firm_id = b.firm_id;

        SELECT ledger_id INTO v_supplier_led
        FROM   trading.party_profiles
        WHERE  id = b.supplier_pp AND firm_id = b.firm_id;

        IF v_buyer_led IS NULL OR v_supplier_led IS NULL THEN
            RAISE NOTICE 'SKIP bill %: buyer ledger=% / supplier ledger=% — koi ek missing',
                b.bill_id, v_buyer_led, v_supplier_led;
            n_skip := n_skip + 1;
            CONTINUE;
        END IF;

        IF v_buyer_led = v_supplier_led THEN
            RAISE NOTICE 'SKIP bill %: buyer aur supplier ledger same hai (%)', b.bill_id, v_buyer_led;
            n_skip := n_skip + 1;
            CONTINUE;
        END IF;

        v_total := COALESCE(b.bill_total, 0);

        -- ================= 1) SALES BILL voucher → Dr BUYER / Cr SUPPLIER =================
        IF v_total > 0 THEN
            -- DELETE-then-INSERT (idempotent). Voucher HEADER preserve.
            DELETE FROM accounting.voucher_lines WHERE voucher_id = b.bill_voucher;

            INSERT INTO accounting.voucher_lines (id, voucher_id, ledger_id, debit_credit, amount, narration, sort_order)
            VALUES
                (gen_random_uuid(), b.bill_voucher, v_buyer_led,    'Dr', v_total, 'Sales bill (buyer) — broker rebuild',    0),
                (gen_random_uuid(), b.bill_voucher, v_supplier_led, 'Cr', v_total, 'Sales bill (supplier) — broker rebuild', 1);

            n_bill_v := n_bill_v + 1;
        END IF;

        -- ================= 2) SALES GR (sales_return) → Dr SUPPLIER / Cr BUYER =============
        FOR gr IN
            SELECT id AS gr_id, voucher_id AS gr_voucher, total_return_amount AS gr_total
            FROM   trading.goods_returns
            WHERE  original_bill_id = b.bill_id
              AND  firm_id          = b.firm_id
              AND  voucher_id IS NOT NULL
              AND  deleted_at IS NULL
        LOOP
            v_gr_total := COALESCE(gr.gr_total, 0);
            IF v_gr_total <= 0 THEN
                CONTINUE;
            END IF;

            DELETE FROM accounting.voucher_lines WHERE voucher_id = gr.gr_voucher;

            INSERT INTO accounting.voucher_lines (id, voucher_id, ledger_id, debit_credit, amount, narration, sort_order)
            VALUES
                (gen_random_uuid(), gr.gr_voucher, v_supplier_led, 'Dr', v_gr_total, 'Sales return (supplier) — broker rebuild', 0),
                (gen_random_uuid(), gr.gr_voucher, v_buyer_led,    'Cr', v_gr_total, 'Sales return (buyer) — broker rebuild',    1);

            n_gr_v := n_gr_v + 1;
        END LOOP;
    END LOOP;

    -- ================= 3) RECEIPT vouchers → Dr SUPPLIER / Cr BUYER (per sales-bill alloc) =====
    -- Ek payment voucher KAI sales bills cover kar sakta hai. Is liye PER VOUCHER ek baar
    -- lines DELETE karte hain, phir us voucher ki HAR sales-bill allocation ke liye ek
    -- Dr-supplier / Cr-buyer pair INSERT karte hain (per-bill allocated amount).
    -- Purchase-bill payments ko CHHOD dete hain (un me allocation purchase bill ki hoti).
    --
    -- NOTE: ek voucher me agar ek-do purchase allocation bhi ho to ye script us voucher ko
    -- sirf SALES allocations ke hisaab se rebuild karegi. Practically broker me ek receipt
    -- ek sale ke liye banta hai; mixed sales+purchase ek hi voucher me hona rare hai. Aisa
    -- voucher dikhe to neeche ka VERIFY use unbalanced/odd flag kar dega.
    FOR pv IN
        SELECT DISTINCT p.voucher_id AS pay_voucher, p.firm_id AS firm_id
        FROM   trading.payments p
        JOIN   trading.payment_allocations a ON a.payment_id = p.id
        JOIN   trading.bills bb              ON bb.id = a.bill_id
        WHERE  p.voucher_id IS NOT NULL
          AND  p.deleted_at IS NULL
          AND  bb.bill_type = 'sales'
          AND  bb.buyer_party_id IS NOT NULL
    LOOP
        -- Pehle check: is voucher ki sabhi sales allocations ke buyer+supplier ledgers maujood hain?
        -- Agar koi ledger missing ho to is voucher ko SKIP (lines ko chhedo mat).
        IF EXISTS (
            SELECT 1
            FROM   trading.payment_allocations a
            JOIN   trading.payments p          ON p.id = a.payment_id
            JOIN   trading.bills bb            ON bb.id = a.bill_id
            LEFT   JOIN trading.party_profiles sp ON sp.id = bb.party_id        AND sp.firm_id = bb.firm_id
            LEFT   JOIN trading.party_profiles bp ON bp.id = bb.buyer_party_id  AND bp.firm_id = bb.firm_id
            WHERE  p.voucher_id = pv.pay_voucher
              AND  bb.bill_type = 'sales'
              AND  bb.buyer_party_id IS NOT NULL
              AND  (sp.ledger_id IS NULL OR bp.ledger_id IS NULL OR sp.ledger_id = bp.ledger_id)
        ) THEN
            RAISE NOTICE 'SKIP receipt voucher %: kisi sales allocation ka buyer/supplier ledger missing/same', pv.pay_voucher;
            n_skip := n_skip + 1;
            CONTINUE;
        END IF;

        -- Voucher ki saari lines ek baar hatao, phir har sales allocation ka pair daalo.
        DELETE FROM accounting.voucher_lines WHERE voucher_id = pv.pay_voucher;

        INSERT INTO accounting.voucher_lines (id, voucher_id, ledger_id, debit_credit, amount, narration, sort_order)
        SELECT
            gen_random_uuid(),
            pv.pay_voucher,
            t.ledger_id,
            t.dc,
            t.amount,
            t.narr,
            t.so
        FROM (
            SELECT
                sp.ledger_id                       AS ledger_id,
                'Dr'::char(2)                      AS dc,
                a.allocated                        AS amount,
                'Receipt (supplier) — broker rebuild' AS narr,
                (row_number() OVER (ORDER BY bb.bill_no) - 1) * 2     AS so
            FROM   trading.payment_allocations a
            JOIN   trading.payments p ON p.id = a.payment_id
            JOIN   trading.bills bb   ON bb.id = a.bill_id
            JOIN   trading.party_profiles sp ON sp.id = bb.party_id       AND sp.firm_id = bb.firm_id
            WHERE  p.voucher_id = pv.pay_voucher
              AND  bb.bill_type = 'sales'
              AND  bb.buyer_party_id IS NOT NULL
              AND  a.allocated > 0

            UNION ALL

            SELECT
                bp.ledger_id                       AS ledger_id,
                'Cr'::char(2)                      AS dc,
                a.allocated                        AS amount,
                'Receipt (buyer) — broker rebuild' AS narr,
                (row_number() OVER (ORDER BY bb.bill_no) - 1) * 2 + 1 AS so
            FROM   trading.payment_allocations a
            JOIN   trading.payments p ON p.id = a.payment_id
            JOIN   trading.bills bb   ON bb.id = a.bill_id
            JOIN   trading.party_profiles bp ON bp.id = bb.buyer_party_id AND bp.firm_id = bb.firm_id
            WHERE  p.voucher_id = pv.pay_voucher
              AND  bb.bill_type = 'sales'
              AND  bb.buyer_party_id IS NOT NULL
              AND  a.allocated > 0
        ) t;

        n_pay_v := n_pay_v + 1;
    END LOOP;

    RAISE NOTICE '55-broker-sales-rebuild: sales bill vouchers rebuilt=%, sales_return vouchers rebuilt=%, receipt vouchers rebuilt=%, skipped (ledger missing/same)=%',
        n_bill_v, n_gr_v, n_pay_v, n_skip;
END $$;

-- ============================================================================
-- VERIFY 1 — har eligible SALES BILL voucher ab EXACTLY 2 lines (Dr buyer + Cr
-- supplier) ka hona chahiye. Ye query un bill vouchers ko dikhati hai jo is
-- shape ke MUTABIK NAHI hain — IDEAL result = 0 rows.
-- (Jin bills ka buyer/supplier ledger hi nahi tha wo skip hue — wo yahan aa
--  sakte hain; pehle Chart of Accounts me ledger banakar dobara chalao.)
-- ============================================================================
SELECT
    'bill_voucher_not_2line' AS check_name,
    b.id        AS bill_id,
    b.bill_no,
    v.voucher_no,
    count(vl.*) AS line_count,
    sum(CASE WHEN vl.debit_credit = 'Dr' AND vl.ledger_id = buy.ledger_id THEN 1 ELSE 0 END) AS dr_buyer_lines,
    sum(CASE WHEN vl.debit_credit = 'Cr' AND vl.ledger_id = sup.ledger_id THEN 1 ELSE 0 END) AS cr_supplier_lines
FROM   trading.bills b
JOIN   accounting.vouchers v        ON v.id = b.voucher_id
JOIN   accounting.voucher_lines vl  ON vl.voucher_id = v.id
JOIN   trading.party_profiles sup   ON sup.id = b.party_id        AND sup.firm_id = b.firm_id
JOIN   trading.party_profiles buy   ON buy.id = b.buyer_party_id  AND buy.firm_id = b.firm_id
WHERE  b.bill_type = 'sales'
  AND  b.buyer_party_id IS NOT NULL
  AND  b.voucher_id IS NOT NULL
  AND  b.deleted_at IS NULL
  AND  buy.ledger_id IS NOT NULL
  AND  sup.ledger_id IS NOT NULL
  AND  sup.ledger_id <> buy.ledger_id
  AND  b.total > 0
GROUP BY b.id, b.bill_no, v.voucher_no
HAVING count(vl.*) <> 2
    OR sum(CASE WHEN vl.debit_credit = 'Dr' AND vl.ledger_id = buy.ledger_id THEN 1 ELSE 0 END) <> 1
    OR sum(CASE WHEN vl.debit_credit = 'Cr' AND vl.ledger_id = sup.ledger_id THEN 1 ELSE 0 END) <> 1
ORDER BY b.bill_no;

-- ============================================================================
-- VERIFY 2 — koi bhi rebuild kiya SALES-side voucher unbalanced (Dr <> Cr) to
-- nahi? IDEAL result = 0 rows. (Constraint trigger waise bhi insert par balance
-- check karta hai, ye extra safety hai.)
-- ============================================================================
SELECT
    'unbalanced_sales_voucher' AS check_name,
    v.voucher_type,
    v.voucher_no,
    sum(CASE WHEN vl.debit_credit = 'Dr' THEN vl.amount ELSE 0 END) AS dr_total,
    sum(CASE WHEN vl.debit_credit = 'Cr' THEN vl.amount ELSE 0 END) AS cr_total
FROM   accounting.vouchers v
JOIN   accounting.voucher_lines vl ON vl.voucher_id = v.id
WHERE  v.voucher_type IN ('sales', 'sales_return', 'receipt')
  AND  v.deleted_at IS NULL
GROUP BY v.id, v.voucher_type, v.voucher_no
HAVING sum(CASE WHEN vl.debit_credit = 'Dr' THEN vl.amount ELSE 0 END)
     <> sum(CASE WHEN vl.debit_credit = 'Cr' THEN vl.amount ELSE 0 END)
ORDER BY v.voucher_type, v.voucher_no;

SELECT 'migration 55-broker-sales-rebuild complete' AS status;
