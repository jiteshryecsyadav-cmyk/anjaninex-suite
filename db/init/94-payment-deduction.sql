-- ============================================================================
-- 94: Payment allocation par DEDUCTION — discount/packing ka paisa kahan gaya
-- ============================================================================
-- DIKKAT (jo user ko dikhti thi):
--   Receipt me DIS AMT 387 + PACKING 20 kaata, NET AMT 19,911 bana, utna hi paisa
--   aaya — screen par "Balance Pending ₹0". Par Payments LIST me usi receipt par
--   "₹407 pending" dikhta raha, aur bill kabhi "paid" hua hi nahi.
--
-- WAJAH:
--   bill.paid_amount me sirf CASH (19,911) judta tha. Kaata hua 407 kahin record
--   hi nahi hota tha — sirf payments.notes me "DED:..." text ke roop me padha rehta.
--   Isliye (total − paid_amount) hamesha 407 bolta tha — Payments list, Dashboard
--   outstanding, party ledger report, sab jagah.
--
-- ILAAJ:
--   Har allocation par ab "deduction" bhi save hoga. Bill se nikalta hai:
--       paid_amount += allocated + deduction
--   aur voucher me uski line bhi banegi (Dr Discount Allowed / Cr Buyer), taaki
--   Trading aur Accounting dono ek hi baat bolein.
--
-- PURANI ENTRIES: ye script unhe nahi chhedti (voucher bhi banana padta hai, jo
--   SQL se karna risky hai). Purani receipt kholo → Save karo → apne aap sudhar
--   jayegi (Update naya voucher banata hai).
-- ============================================================================

ALTER TABLE trading.payment_allocations
    ADD COLUMN IF NOT EXISTS deduction NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN trading.payment_allocations.deduction IS
    'Discount + packing + rate diff + other jo bill se KATA. Cash nahi aaya par bill '
    'settle ho gaya. bill.paid_amount me allocated ke saath ye bhi judta hai.';

-- ============================================================================
-- "Discount Received" ledger — PURCHASE side ke liye
-- ============================================================================
-- Sales settlement (aadhat model) me discount ka hisaab Supplier↔Buyer ke beech
-- hi rehta hai — firm ka P&L usme nahi aata, is liye koi naya ledger nahi chahiye.
-- Par PURCHASE payment me firm apna paisa deti hai; kam diya to wo firm ki AAMDANI
-- hai. "Discount Allowed" (kharcha) pehle se hai [47-expense-ledgers.sql];
-- uska income wala jodidar yahan bana rahe hain.
DO $$
DECLARE
    f          RECORD;
    v_inc      UUID;   -- Income head
    v_g_iinc   UUID;   -- Indirect Income group
    v_sg       UUID;   -- Discount Received sub-group
BEGIN
    FOR f IN SELECT id FROM platform.firms LOOP

        SELECT id INTO v_inc FROM accounting.account_heads
            WHERE firm_id = f.id AND nature = 'income' LIMIT 1;
        IF v_inc IS NULL THEN
            CONTINUE;   -- firm ka COA seed hi nahi hua — skip
        END IF;

        SELECT id INTO v_g_iinc FROM accounting.account_groups
            WHERE firm_id = f.id AND head_id = v_inc AND name = 'Indirect Income' LIMIT 1;
        IF v_g_iinc IS NULL THEN
            INSERT INTO accounting.account_groups (firm_id, head_id, name, is_system)
            VALUES (f.id, v_inc, 'Indirect Income', TRUE)
            RETURNING id INTO v_g_iinc;
        END IF;

        SELECT id INTO v_sg FROM accounting.sub_groups
            WHERE firm_id = f.id AND group_id = v_g_iinc AND name = 'Discount Received' LIMIT 1;
        IF v_sg IS NULL THEN
            INSERT INTO accounting.sub_groups (firm_id, group_id, name, is_system)
            VALUES (f.id, v_g_iinc, 'Discount Received', TRUE)
            RETURNING id INTO v_sg;
        END IF;

        -- income ledger natural side Cr
        INSERT INTO accounting.ledgers (firm_id, sub_group_id, name, opening_balance, opening_type, is_active)
        SELECT f.id, v_sg, 'Discount Received', 0, 'Cr', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM accounting.ledgers l
            WHERE l.firm_id = f.id AND l.name = 'Discount Received'
        );

    END LOOP;
END $$;

SELECT 'payment_allocations.deduction + Discount Received ledger ready ✓' AS status;

-- Kaunse purane receipts me ye dikkat hai — dekhne ke liye:
--   SELECT p.payment_no, b.bill_no, b.total, b.paid_amount,
--          (b.total - b.paid_amount) AS phansa_hua
--     FROM trading.payment_allocations a
--     JOIN trading.payments p ON p.id = a.payment_id AND p.deleted_at IS NULL
--     JOIN trading.bills b    ON b.id = a.bill_id
--    WHERE a.deduction = 0
--      AND b.total - b.paid_amount > 0.01
--      AND p.notes LIKE '%DED:%'
--    ORDER BY p.payment_date DESC;
