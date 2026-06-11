-- ============================================================================
-- Chart of Accounts — 4-HEAD migration (Tally fundamental)
--   Heads: Assets, Liabilities, Income, Expenses.  Capital ab Liabilities ke
--   neeche ek GROUP hai (alag head nahi).
--
-- Ye script do kaam karta hai:
--   PART A  — existing firms jinke paas "Capital" head hai (purana 5-head):
--             uske groups ko Liabilities head ke neeche le aao, Capital head delete.
--   PART B  — firms jinke paas koi head hi nahi (khaali COA): poora 4-head
--             chart of accounts + essential ledgers seed karo.
--   PART C  — har firm ke party/supplier ke liye missing ledgers bana do
--             (Sundry Debtors / Sundry Creditors) — voucher dropdown bhar jaye.
--
-- Idempotent: dobara chalane se kuch toot-ta nahi.
-- Covers tenant firms (Jaipur HQ etc.) AUR Anjaninex Books — dono.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- PART A — 5-head  ->  4-head (Capital ko Liabilities me merge)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r RECORD;
    v_liab UUID;
    v_cap  UUID;
BEGIN
    FOR r IN SELECT DISTINCT firm_id FROM accounting.account_heads WHERE nature = 'capital' LOOP
        SELECT id INTO v_liab FROM accounting.account_heads
            WHERE firm_id = r.firm_id AND nature = 'liabilities' LIMIT 1;
        SELECT id INTO v_cap FROM accounting.account_heads
            WHERE firm_id = r.firm_id AND nature = 'capital' LIMIT 1;

        IF v_liab IS NOT NULL AND v_cap IS NOT NULL THEN
            -- Capital head ke saare groups ab Liabilities ke neeche
            UPDATE accounting.account_groups
               SET head_id = v_liab
             WHERE firm_id = r.firm_id AND head_id = v_cap;
            -- Ab Capital head khaali — delete
            DELETE FROM accounting.account_heads WHERE id = v_cap;
        END IF;
    END LOOP;

    -- Heads ka sort order standardize karo
    UPDATE accounting.account_heads SET sort_order = 1 WHERE nature = 'assets';
    UPDATE accounting.account_heads SET sort_order = 2 WHERE nature = 'liabilities';
    UPDATE accounting.account_heads SET sort_order = 3 WHERE nature = 'income';
    UPDATE accounting.account_heads SET sort_order = 4 WHERE nature = 'expenses';
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- PART B — khaali firms me poora 4-head COA seed
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    f RECORD;
    v_assets UUID; v_liab UUID; v_inc UUID; v_exp UUID;
    v_g_ca UUID; v_g_cl UUID; v_g_cap UUID; v_g_sales UUID; v_g_dexp UUID; v_g_iexp UUID;
    v_sg_bank UUID; v_sg_cash UUID; v_sg_purchase UUID; v_sg_office UUID;
    v_sg_bankchg UUID; v_sg_sale UUID; v_sg_comm UUID; v_sg_owncap UUID;
BEGIN
    FOR f IN SELECT id FROM platform.firms LOOP
        -- Already COA hai to skip
        IF EXISTS (SELECT 1 FROM accounting.account_heads WHERE firm_id = f.id) THEN
            CONTINUE;
        END IF;

        -- HEADS (4)
        INSERT INTO accounting.account_heads (id, firm_id, code, name, nature, sign, sort_order, is_system) VALUES
            (gen_random_uuid(), f.id, 'A', 'Assets',      'assets',      'Dr', 1, TRUE),
            (gen_random_uuid(), f.id, 'L', 'Liabilities', 'liabilities', 'Cr', 2, TRUE),
            (gen_random_uuid(), f.id, 'I', 'Income',      'income',      'Cr', 3, TRUE),
            (gen_random_uuid(), f.id, 'E', 'Expenses',    'expenses',    'Dr', 4, TRUE)
        ON CONFLICT (firm_id, code) DO NOTHING;

        SELECT id INTO v_assets FROM accounting.account_heads WHERE firm_id=f.id AND code='A';
        SELECT id INTO v_liab   FROM accounting.account_heads WHERE firm_id=f.id AND code='L';
        SELECT id INTO v_inc    FROM accounting.account_heads WHERE firm_id=f.id AND code='I';
        SELECT id INTO v_exp    FROM accounting.account_heads WHERE firm_id=f.id AND code='E';

        -- GROUPS (Capital + Reserves ab Liabilities ke neeche)
        INSERT INTO accounting.account_groups (id, firm_id, head_id, name, is_system) VALUES
            (gen_random_uuid(), f.id, v_assets, 'Current Assets',      TRUE),
            (gen_random_uuid(), f.id, v_assets, 'Fixed Assets',        TRUE),
            (gen_random_uuid(), f.id, v_assets, 'Investments',         TRUE),
            (gen_random_uuid(), f.id, v_liab,   'Current Liabilities', TRUE),
            (gen_random_uuid(), f.id, v_liab,   'Loans & Liabilities', TRUE),
            (gen_random_uuid(), f.id, v_liab,   'Capital Account',     TRUE),
            (gen_random_uuid(), f.id, v_liab,   'Reserves & Surplus',  TRUE),
            (gen_random_uuid(), f.id, v_inc,    'Sales / Income',      TRUE),
            (gen_random_uuid(), f.id, v_inc,    'Other Income',        TRUE),
            (gen_random_uuid(), f.id, v_exp,    'Direct Expenses',     TRUE),
            (gen_random_uuid(), f.id, v_exp,    'Indirect Expenses',   TRUE);

        SELECT id INTO v_g_ca   FROM accounting.account_groups WHERE firm_id=f.id AND name='Current Assets';
        SELECT id INTO v_g_cl   FROM accounting.account_groups WHERE firm_id=f.id AND name='Current Liabilities';
        SELECT id INTO v_g_cap  FROM accounting.account_groups WHERE firm_id=f.id AND name='Capital Account';
        SELECT id INTO v_g_sales FROM accounting.account_groups WHERE firm_id=f.id AND name='Sales / Income';
        SELECT id INTO v_g_dexp FROM accounting.account_groups WHERE firm_id=f.id AND name='Direct Expenses';
        SELECT id INTO v_g_iexp FROM accounting.account_groups WHERE firm_id=f.id AND name='Indirect Expenses';

        -- SUB GROUPS
        INSERT INTO accounting.sub_groups (firm_id, group_id, name, is_system) VALUES
            (f.id, v_g_ca,   'Bank Accounts',       TRUE),
            (f.id, v_g_ca,   'Cash-in-Hand',        TRUE),
            (f.id, v_g_ca,   'Sundry Debtors',      TRUE),
            (f.id, v_g_ca,   'Stock-in-Hand',       TRUE),
            (f.id, v_g_cl,   'Sundry Creditors',    TRUE),
            (f.id, v_g_cl,   'Duties & Taxes',      TRUE),
            (f.id, v_g_cap,  'Owner''s Capital',    TRUE),
            (f.id, v_g_dexp, 'Purchase',            TRUE),
            (f.id, v_g_dexp, 'Freight & Carriage',  TRUE),
            (f.id, v_g_iexp, 'Office Expenses',     TRUE),
            (f.id, v_g_iexp, 'Travel Expenses',     TRUE),
            (f.id, v_g_iexp, 'Salary & Wages',      TRUE),
            (f.id, v_g_iexp, 'Bank Charges',        TRUE),
            (f.id, v_g_sales,'Sales',               TRUE),
            (f.id, v_g_sales,'Commission Received', TRUE);

        SELECT id INTO v_sg_cash     FROM accounting.sub_groups WHERE firm_id=f.id AND name='Cash-in-Hand';
        SELECT id INTO v_sg_purchase FROM accounting.sub_groups WHERE firm_id=f.id AND name='Purchase';
        SELECT id INTO v_sg_office   FROM accounting.sub_groups WHERE firm_id=f.id AND name='Office Expenses';
        SELECT id INTO v_sg_bankchg  FROM accounting.sub_groups WHERE firm_id=f.id AND name='Bank Charges';
        SELECT id INTO v_sg_sale     FROM accounting.sub_groups WHERE firm_id=f.id AND name='Sales';
        SELECT id INTO v_sg_comm     FROM accounting.sub_groups WHERE firm_id=f.id AND name='Commission Received';
        SELECT id INTO v_sg_owncap   FROM accounting.sub_groups WHERE firm_id=f.id AND name='Owner''s Capital';

        -- ESSENTIAL LEDGERS
        INSERT INTO accounting.ledgers (firm_id, sub_group_id, name, opening_balance, opening_type) VALUES
            (f.id, v_sg_cash,     'Cash',                 0, 'Dr'),
            (f.id, v_sg_sale,     'Sales Account',        0, 'Cr'),
            (f.id, v_sg_comm,     'Commission Received',  0, 'Cr'),
            (f.id, v_sg_purchase, 'Purchase Account',     0, 'Dr'),
            (f.id, v_sg_owncap,   'Owner''s Capital',     0, 'Cr'),
            (f.id, v_sg_office,   'Office Rent',          0, 'Dr'),
            (f.id, v_sg_bankchg,  'Bank Charges',         0, 'Dr');
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- PART C — har firm ke party/supplier ke missing ledgers (voucher dropdown fill)
--   buyer  -> Sundry Debtors (Dr) ;  seller/both -> Sundry Creditors (Cr)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    f RECORD;
    v_sg_deb  UUID;
    v_sg_cred UUID;
BEGIN
    FOR f IN SELECT id FROM platform.firms LOOP
        SELECT id INTO v_sg_deb  FROM accounting.sub_groups WHERE firm_id=f.id AND name='Sundry Debtors'   LIMIT 1;
        SELECT id INTO v_sg_cred FROM accounting.sub_groups WHERE firm_id=f.id AND name='Sundry Creditors' LIMIT 1;
        IF v_sg_deb IS NULL OR v_sg_cred IS NULL THEN
            CONTINUE;
        END IF;

        -- Debtors: buyer-type parties
        INSERT INTO accounting.ledgers (firm_id, sub_group_id, contact_id, name, opening_balance, opening_type)
        SELECT f.id, v_sg_deb, c.id, c.display_name, 0, 'Dr'
        FROM trading.party_profiles p
        JOIN core.contacts c ON c.id = p.contact_id
        WHERE p.firm_id = f.id
          AND p.party_type = 'buyer'
          AND NOT EXISTS (SELECT 1 FROM accounting.ledgers l WHERE l.firm_id=f.id AND l.contact_id=c.id);

        -- Creditors: seller / both parties
        INSERT INTO accounting.ledgers (firm_id, sub_group_id, contact_id, name, opening_balance, opening_type)
        SELECT f.id, v_sg_cred, c.id, c.display_name, 0, 'Cr'
        FROM trading.party_profiles p
        JOIN core.contacts c ON c.id = p.contact_id
        WHERE p.firm_id = f.id
          AND p.party_type IN ('seller', 'both')
          AND NOT EXISTS (SELECT 1 FROM accounting.ledgers l WHERE l.firm_id=f.id AND l.contact_id=c.id);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'COA 4-head migration done ✓' AS status;
SELECT f.name AS firm,
       (SELECT count(*) FROM accounting.account_heads  h WHERE h.firm_id=f.id) AS heads,
       (SELECT count(*) FROM accounting.account_groups g WHERE g.firm_id=f.id) AS groups,
       (SELECT count(*) FROM accounting.ledgers        l WHERE l.firm_id=f.id) AS ledgers
FROM platform.firms f
ORDER BY f.name;
