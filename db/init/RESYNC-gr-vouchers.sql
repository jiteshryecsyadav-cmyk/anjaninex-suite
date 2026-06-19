-- ============================================================================
-- RESYNC-gr-vouchers.sql — back-fill accounting vouchers for EXISTING Goods
-- Returns that were created before migration 50 (and so have voucher_id = NULL).
--
-- WHY: historically GoodsReturnService.Create posted NO accounting voucher, so
-- old GRs never hit the party khata. After deploying the code fix, NEW GRs post a
-- voucher automatically, but OLD ones stay missing. This script posts a balanced
-- 2-line voucher per such GR so old party balances become correct too.
--
-- Posting (mirrors the app's PostVoucherForGr, simplified to a single offset line):
--   Sales GR     → Cr bill-party ledger (full)  +  Dr "Sales Return" ledger (full)
--   Purchase GR  → Dr bill-party ledger (full)  +  Cr "Purchase Return" ledger (full)
-- Dr = Cr = total_return_amount → always passes the Dr=Cr balance trigger.
--
-- SAFE + IDEMPOTENT:
--   * Only touches GRs where voucher_id IS NULL, deleted_at IS NULL,
--     status <> 'rejected', and total_return_amount > 0.
--   * Skips GRs whose party has no linked ledger (logged via RAISE NOTICE).
--   * Sets goods_returns.voucher_id so a re-run skips already-synced GRs.
--   * Wrapped per-firm; re-runnable any number of times.
--
-- Runs as a privileged role (postgres). RLS is bypassed by the firm-scoped WHERE.
-- ============================================================================

DO $$
DECLARE
    g            RECORD;
    v_firm       UUID;
    v_branch     UUID;
    v_bill_type  TEXT;
    v_party_id   UUID;          -- trading.party_profiles.id (the bill party)
    v_party_led  UUID;          -- accounting.ledgers.id for that party
    v_ret_led    UUID;          -- Sales Return / Purchase Return ledger
    v_sub_group  UUID;
    v_is_sales   BOOLEAN;
    v_ret_name   TEXT;
    v_vtype      TEXT;
    v_vno        TEXT;
    v_vid        UUID;
    v_prefix     TEXT;
    v_seq        BIGINT;
    v_creator    UUID;
    v_count      INT := 0;
BEGIN
    FOR g IN
        SELECT gr.*
        FROM trading.goods_returns gr
        WHERE gr.voucher_id IS NULL
          AND gr.deleted_at IS NULL
          AND gr.status <> 'rejected'
          AND gr.total_return_amount > 0
        ORDER BY gr.firm_id, gr.gr_date
    LOOP
        v_firm   := g.firm_id;
        v_branch := g.branch_id;

        -- Resolve bill type + bill party (the party the bill debited/credited).
        v_bill_type := 'sales';
        v_party_id  := g.supplier_party_id;
        IF g.original_bill_id IS NOT NULL THEN
            SELECT b.bill_type, b.party_id INTO v_bill_type, v_party_id
            FROM trading.bills b WHERE b.id = g.original_bill_id;
        END IF;
        v_is_sales := (COALESCE(v_bill_type,'sales') <> 'purchase');

        -- Party ledger (bill ne isi ko Dr/Cr kiya).
        SELECT pp.ledger_id INTO v_party_led
        FROM trading.party_profiles pp WHERE pp.id = v_party_id;
        IF v_party_led IS NULL THEN
            RAISE NOTICE 'SKIP GR % (firm %): party % has no linked ledger', g.gr_no, v_firm, v_party_id;
            CONTINUE;
        END IF;

        -- Find-or-create the Sales Return / Purchase Return ledger for this firm.
        v_ret_name := CASE WHEN v_is_sales THEN 'Sales Return' ELSE 'Purchase Return' END;
        SELECT id INTO v_ret_led
        FROM accounting.ledgers WHERE firm_id = v_firm AND name = v_ret_name LIMIT 1;

        IF v_ret_led IS NULL THEN
            -- Pick a sensible sub-group (income for sales, expense for purchase), else any.
            SELECT sg.id INTO v_sub_group FROM accounting.sub_groups sg
            WHERE sg.firm_id = v_firm
              AND ( (v_is_sales  AND sg.name IN ('Direct Income','Sales Accounts','Indirect Income','Other Income'))
                 OR (NOT v_is_sales AND sg.name IN ('Direct Expenses','Purchase Accounts','Indirect Expenses','Other Expenses')) )
            LIMIT 1;
            IF v_sub_group IS NULL THEN
                SELECT sg.id INTO v_sub_group FROM accounting.sub_groups sg
                WHERE sg.firm_id = v_firm
                  AND lower(sg.name) LIKE (CASE WHEN v_is_sales THEN '%income%' ELSE '%expense%' END)
                LIMIT 1;
            END IF;
            IF v_sub_group IS NULL THEN
                SELECT sg.id INTO v_sub_group FROM accounting.sub_groups sg WHERE sg.firm_id = v_firm LIMIT 1;
            END IF;
            IF v_sub_group IS NULL THEN
                RAISE NOTICE 'SKIP GR % (firm %): no sub-groups (accounting not seeded)', g.gr_no, v_firm;
                CONTINUE;
            END IF;

            INSERT INTO accounting.ledgers (id, firm_id, sub_group_id, name, opening_balance, opening_type, is_active, created_at, updated_at)
            VALUES (gen_random_uuid(), v_firm, v_sub_group, v_ret_name, 0,
                    CASE WHEN v_is_sales THEN 'Dr' ELSE 'Cr' END, TRUE, now(), now())
            RETURNING id INTO v_ret_led;
        END IF;

        -- Voucher number — race-safe per-firm/branch/type via platform.voucher_counters.
        v_vtype := CASE WHEN v_is_sales THEN 'sales_return' ELSE 'purchase_return' END;
        SELECT COALESCE(voucher_prefix, code || '-V-') INTO v_prefix
        FROM core.branches WHERE id = v_branch;
        v_prefix := COALESCE(v_prefix, 'V-');

        INSERT INTO platform.voucher_counters (firm_id, branch_id, counter_key, fy_year, next_no)
        VALUES (v_firm, v_branch, 'voucher.' || v_vtype, EXTRACT(YEAR FROM g.gr_date)::INT, 1)
        ON CONFLICT (firm_id, branch_id, counter_key, fy_year)
        DO UPDATE SET next_no = platform.voucher_counters.next_no + 1
        RETURNING next_no INTO v_seq;

        v_vno := v_prefix || (CASE WHEN v_is_sales THEN 'SR' ELSE 'PR' END) || lpad(v_seq::TEXT, 4, '0');

        -- creator fallback
        v_creator := g.created_by;

        -- Header
        v_vid := gen_random_uuid();
        INSERT INTO accounting.vouchers
            (id, firm_id, branch_id, voucher_type, voucher_no, voucher_date, narration,
             total_amount, source_module, source_ref_id, is_posted, created_by, created_at, updated_at)
        VALUES
            (v_vid, v_firm, v_branch, v_vtype, v_vno, g.gr_date,
             'Back-fill voucher for Goods Return ' || g.gr_no,
             g.total_return_amount, 'trading', g.id, TRUE, v_creator, now(), now());

        -- Two balanced lines (Dr = Cr = total).
        IF v_is_sales THEN
            INSERT INTO accounting.voucher_lines (id, voucher_id, ledger_id, debit_credit, amount, narration, sort_order)
            VALUES (gen_random_uuid(), v_vid, v_party_led, 'Cr', g.total_return_amount, 'GR ' || g.gr_no, 0),
                   (gen_random_uuid(), v_vid, v_ret_led,   'Dr', g.total_return_amount, 'Sales return',  1);
        ELSE
            INSERT INTO accounting.voucher_lines (id, voucher_id, ledger_id, debit_credit, amount, narration, sort_order)
            VALUES (gen_random_uuid(), v_vid, v_party_led, 'Dr', g.total_return_amount, 'GR ' || g.gr_no, 0),
                   (gen_random_uuid(), v_vid, v_ret_led,   'Cr', g.total_return_amount, 'Purchase return', 1);
        END IF;

        -- Link voucher back to GR (so a re-run skips it).
        UPDATE trading.goods_returns SET voucher_id = v_vid, updated_at = now() WHERE id = g.id;

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'RESYNC-gr-vouchers: posted % GR voucher(s).', v_count;
END $$;

SELECT 'RESYNC-gr-vouchers complete' AS status;
