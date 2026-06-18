-- ============================================================================
-- 47 — Common EXPENSE LEDGERS (Rent, Salary, Electricity, ...) per firm
--
-- Goal: Rent / Salary / etc. payments book ho saken aur unka ledger statement
-- (khata) dikhe. Ye ledgers Ledger Master list me apne aap aa jate hain aur
-- generic statement view inhe support karta hai.
--
-- Hierarchy (06-accounting.sql + 18-coa-4head-migrate.sql ke mutabik):
--   account_heads → account_groups → sub_groups → ledgers   (sab firm-scoped)
--   Expenses head  →  'Indirect Expenses' / 'Direct Expenses' groups
--
-- Approach: HAR firm ke liye —
--   1. zaroori sub_groups ensure karo (INSERT ... WHERE NOT EXISTS)
--   2. har expense ledger ensure karo (INSERT ... WHERE NOT EXISTS)
-- Idempotent: dobara chalane se duplicate nahi banega. Bill/voucher posting
-- logic ko ye chhuta nahi.
-- ============================================================================

DO $$
DECLARE
    f          RECORD;
    v_exp      UUID;   -- Expenses head
    v_g_iexp   UUID;   -- Indirect Expenses group
    v_g_dexp   UUID;   -- Direct Expenses group
    v_sg       UUID;   -- working sub_group id

    -- (ledger_name, sub_group_name, group_kind) — group_kind: 'I'=Indirect, 'D'=Direct
    -- Sub-group jis ke neeche ledger rakhna hai. Jo sub_group nahi hai, neeche
    -- ensure ho jata hai.
    rows CONSTANT TEXT[][] := ARRAY[
        ['Rent',                    'Office Expenses',       'I'],
        ['Salary & Wages',          'Salary & Wages',        'I'],
        ['Electricity',             'Office Expenses',       'I'],
        ['Telephone & Internet',    'Office Expenses',       'I'],
        ['Office Expenses',         'Office Expenses',       'I'],
        ['Travelling & Conveyance', 'Travel Expenses',       'I'],
        ['Printing & Stationery',   'Office Expenses',       'I'],
        ['Bank Charges',            'Bank Charges',          'I'],
        ['Commission Paid',         'Commission Paid',       'I'],
        ['Repairs & Maintenance',   'Office Expenses',       'I'],
        ['Freight & Cartage',       'Freight & Carriage',    'D'],
        ['Discount Allowed',        'Discount Allowed',      'I']
    ];
    rec        TEXT[];
BEGIN
    FOR f IN SELECT id FROM platform.firms LOOP

        -- Expenses head (nature='expenses'); agar firm ka COA hi seed nahi → skip.
        SELECT id INTO v_exp FROM accounting.account_heads
            WHERE firm_id = f.id AND nature = 'expenses' LIMIT 1;
        IF v_exp IS NULL THEN
            CONTINUE;
        END IF;

        -- Indirect Expenses group ensure (closest expense sub-group bucket)
        SELECT id INTO v_g_iexp FROM accounting.account_groups
            WHERE firm_id = f.id AND head_id = v_exp AND name = 'Indirect Expenses' LIMIT 1;
        IF v_g_iexp IS NULL THEN
            INSERT INTO accounting.account_groups (firm_id, head_id, name, is_system)
            VALUES (f.id, v_exp, 'Indirect Expenses', TRUE)
            RETURNING id INTO v_g_iexp;
        END IF;

        -- Direct Expenses group ensure (Freight ke liye)
        SELECT id INTO v_g_dexp FROM accounting.account_groups
            WHERE firm_id = f.id AND head_id = v_exp AND name = 'Direct Expenses' LIMIT 1;
        IF v_g_dexp IS NULL THEN
            INSERT INTO accounting.account_groups (firm_id, head_id, name, is_system)
            VALUES (f.id, v_exp, 'Direct Expenses', TRUE)
            RETURNING id INTO v_g_dexp;
        END IF;

        -- Har ledger ke liye: sub_group ensure → ledger ensure
        FOREACH rec SLICE 1 IN ARRAY rows LOOP
            -- sub_group dhundo (firm + sahi group ke neeche), nahi to bana do
            IF rec[3] = 'D' THEN
                SELECT id INTO v_sg FROM accounting.sub_groups
                    WHERE firm_id = f.id AND group_id = v_g_dexp AND name = rec[2] LIMIT 1;
                IF v_sg IS NULL THEN
                    INSERT INTO accounting.sub_groups (firm_id, group_id, name, is_system)
                    VALUES (f.id, v_g_dexp, rec[2], TRUE)
                    RETURNING id INTO v_sg;
                END IF;
            ELSE
                SELECT id INTO v_sg FROM accounting.sub_groups
                    WHERE firm_id = f.id AND group_id = v_g_iexp AND name = rec[2] LIMIT 1;
                IF v_sg IS NULL THEN
                    INSERT INTO accounting.sub_groups (firm_id, group_id, name, is_system)
                    VALUES (f.id, v_g_iexp, rec[2], TRUE)
                    RETURNING id INTO v_sg;
                END IF;
            END IF;

            -- ledger ensure — expense ledgers natural side Dr, opening 0
            INSERT INTO accounting.ledgers (firm_id, sub_group_id, name, opening_balance, opening_type, is_active)
            SELECT f.id, v_sg, rec[1], 0, 'Dr', TRUE
            WHERE NOT EXISTS (
                SELECT 1 FROM accounting.ledgers l
                WHERE l.firm_id = f.id AND l.name = rec[1]
            );
        END LOOP;

    END LOOP;
END $$;

-- Verify
SELECT 'Expense ledgers ensured ✓' AS status;
SELECT f.name AS firm,
       (SELECT count(*) FROM accounting.ledgers l
          JOIN accounting.sub_groups sg ON sg.id = l.sub_group_id
          JOIN accounting.account_groups g ON g.id = sg.group_id
          JOIN accounting.account_heads h ON h.id = g.head_id
         WHERE l.firm_id = f.id AND h.nature = 'expenses') AS expense_ledgers
FROM platform.firms f
ORDER BY f.name;
