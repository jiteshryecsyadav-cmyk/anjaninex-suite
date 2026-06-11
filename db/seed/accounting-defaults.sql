-- ============================================================================
-- Namokara Suite — Default Chart of Accounts
-- Run after demo-data.sql. Standard Indian accounting structure.
-- ============================================================================

DO $$
DECLARE
    v_firm_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    -- Head IDs
    v_assets UUID; v_liab UUID; v_cap UUID; v_inc UUID; v_exp UUID;

    -- Group IDs (a few key ones)
    v_g_current_assets UUID; v_g_fixed_assets UUID; v_g_investments UUID;
    v_g_current_liab UUID; v_g_capital UUID;
    v_g_direct_exp UUID; v_g_indirect_exp UUID;
    v_g_sales UUID; v_g_other_income UUID;

    -- Sub group IDs
    v_sg_bank UUID; v_sg_cash UUID; v_sg_debtors UUID; v_sg_creditors UUID;
    v_sg_office_exp UUID; v_sg_travel UUID; v_sg_sales UUID; v_sg_purchase UUID;
BEGIN

-- =================================================
-- HEADS (5 standard)
-- =================================================
INSERT INTO accounting.account_heads (id, firm_id, code, name, nature, sign, sort_order, is_system) VALUES
    (gen_random_uuid(), v_firm_id, 'A', 'Assets',          'assets',      'Dr', 1, TRUE),
    (gen_random_uuid(), v_firm_id, 'L', 'Liabilities',     'liabilities', 'Cr', 2, TRUE),
    (gen_random_uuid(), v_firm_id, 'C', 'Capital Account', 'capital',     'Cr', 3, TRUE),
    (gen_random_uuid(), v_firm_id, 'I', 'Income',          'income',      'Cr', 4, TRUE),
    (gen_random_uuid(), v_firm_id, 'E', 'Expenses',        'expenses',    'Dr', 5, TRUE)
ON CONFLICT (firm_id, code) DO NOTHING;

SELECT id INTO v_assets FROM accounting.account_heads WHERE firm_id = v_firm_id AND code = 'A';
SELECT id INTO v_liab   FROM accounting.account_heads WHERE firm_id = v_firm_id AND code = 'L';
SELECT id INTO v_cap    FROM accounting.account_heads WHERE firm_id = v_firm_id AND code = 'C';
SELECT id INTO v_inc    FROM accounting.account_heads WHERE firm_id = v_firm_id AND code = 'I';
SELECT id INTO v_exp    FROM accounting.account_heads WHERE firm_id = v_firm_id AND code = 'E';

-- =================================================
-- GROUPS (standard Tally-like)
-- =================================================
INSERT INTO accounting.account_groups (id, firm_id, head_id, name, is_system) VALUES
    (gen_random_uuid(), v_firm_id, v_assets, 'Current Assets', TRUE),
    (gen_random_uuid(), v_firm_id, v_assets, 'Fixed Assets',   TRUE),
    (gen_random_uuid(), v_firm_id, v_assets, 'Investments',    TRUE),
    (gen_random_uuid(), v_firm_id, v_liab,   'Current Liabilities', TRUE),
    (gen_random_uuid(), v_firm_id, v_liab,   'Loans & Liabilities', TRUE),
    (gen_random_uuid(), v_firm_id, v_cap,    'Capital Account', TRUE),
    (gen_random_uuid(), v_firm_id, v_cap,    'Reserves & Surplus', TRUE),
    (gen_random_uuid(), v_firm_id, v_inc,    'Sales / Income', TRUE),
    (gen_random_uuid(), v_firm_id, v_inc,    'Other Income',   TRUE),
    (gen_random_uuid(), v_firm_id, v_exp,    'Direct Expenses', TRUE),
    (gen_random_uuid(), v_firm_id, v_exp,    'Indirect Expenses', TRUE);

SELECT id INTO v_g_current_assets FROM accounting.account_groups WHERE firm_id = v_firm_id AND name = 'Current Assets';
SELECT id INTO v_g_fixed_assets   FROM accounting.account_groups WHERE firm_id = v_firm_id AND name = 'Fixed Assets';
SELECT id INTO v_g_current_liab   FROM accounting.account_groups WHERE firm_id = v_firm_id AND name = 'Current Liabilities';
SELECT id INTO v_g_capital        FROM accounting.account_groups WHERE firm_id = v_firm_id AND name = 'Capital Account';
SELECT id INTO v_g_direct_exp     FROM accounting.account_groups WHERE firm_id = v_firm_id AND name = 'Direct Expenses';
SELECT id INTO v_g_indirect_exp   FROM accounting.account_groups WHERE firm_id = v_firm_id AND name = 'Indirect Expenses';
SELECT id INTO v_g_sales          FROM accounting.account_groups WHERE firm_id = v_firm_id AND name = 'Sales / Income';

-- =================================================
-- SUB GROUPS
-- =================================================
INSERT INTO accounting.sub_groups (firm_id, group_id, name, is_system) VALUES
    (v_firm_id, v_g_current_assets, 'Bank Accounts',    TRUE),
    (v_firm_id, v_g_current_assets, 'Cash-in-Hand',     TRUE),
    (v_firm_id, v_g_current_assets, 'Sundry Debtors',   TRUE),
    (v_firm_id, v_g_current_assets, 'Stock-in-Hand',    TRUE),
    (v_firm_id, v_g_current_liab,   'Sundry Creditors', TRUE),
    (v_firm_id, v_g_current_liab,   'Duties & Taxes',   TRUE),
    (v_firm_id, v_g_capital,        'Owner''s Capital', TRUE),
    (v_firm_id, v_g_direct_exp,     'Purchase',         TRUE),
    (v_firm_id, v_g_direct_exp,     'Freight & Carriage', TRUE),
    (v_firm_id, v_g_indirect_exp,   'Office Expenses',  TRUE),
    (v_firm_id, v_g_indirect_exp,   'Travel Expenses',  TRUE),
    (v_firm_id, v_g_indirect_exp,   'Salary & Wages',   TRUE),
    (v_firm_id, v_g_indirect_exp,   'Bank Charges',     TRUE),
    (v_firm_id, v_g_sales,          'Sales',            TRUE),
    (v_firm_id, v_g_sales,          'Commission Received', TRUE);

SELECT id INTO v_sg_bank      FROM accounting.sub_groups WHERE firm_id = v_firm_id AND name = 'Bank Accounts';
SELECT id INTO v_sg_cash      FROM accounting.sub_groups WHERE firm_id = v_firm_id AND name = 'Cash-in-Hand';
SELECT id INTO v_sg_debtors   FROM accounting.sub_groups WHERE firm_id = v_firm_id AND name = 'Sundry Debtors';
SELECT id INTO v_sg_creditors FROM accounting.sub_groups WHERE firm_id = v_firm_id AND name = 'Sundry Creditors';
SELECT id INTO v_sg_office_exp FROM accounting.sub_groups WHERE firm_id = v_firm_id AND name = 'Office Expenses';
SELECT id INTO v_sg_sales     FROM accounting.sub_groups WHERE firm_id = v_firm_id AND name = 'Sales';
SELECT id INTO v_sg_purchase  FROM accounting.sub_groups WHERE firm_id = v_firm_id AND name = 'Purchase';

-- =================================================
-- LEDGERS (essential default ledgers)
-- =================================================
INSERT INTO accounting.ledgers (firm_id, sub_group_id, name, opening_balance, opening_type) VALUES
    (v_firm_id, v_sg_bank,      'HDFC Bank — 1234',     50000.00, 'Dr'),
    (v_firm_id, v_sg_bank,      'ICICI Bank — 5678',    25000.00, 'Dr'),
    (v_firm_id, v_sg_cash,      'Cash',                 10000.00, 'Dr'),
    (v_firm_id, v_sg_sales,     'Sales Account',            0.00, 'Cr'),
    (v_firm_id, v_sg_purchase,  'Purchase Account',         0.00, 'Dr'),
    (v_firm_id, v_sg_office_exp, 'Office Rent',             0.00, 'Dr'),
    (v_firm_id, v_sg_office_exp, 'Electricity Charges',     0.00, 'Dr'),
    (v_firm_id, v_sg_office_exp, 'Internet & Telephone',    0.00, 'Dr');

-- Auto-create ledgers for existing contacts (Bawa = debtor, Parvati = creditor, etc.)
INSERT INTO accounting.ledgers (firm_id, sub_group_id, contact_id, name, opening_balance, opening_type)
SELECT v_firm_id, v_sg_debtors, c.id, c.display_name, 0, 'Dr'
FROM core.contacts c
WHERE c.firm_id = v_firm_id
  AND c.flags->>'is_party' = 'true';

INSERT INTO accounting.ledgers (firm_id, sub_group_id, contact_id, name, opening_balance, opening_type)
SELECT v_firm_id, v_sg_creditors, c.id, c.display_name, 0, 'Cr'
FROM core.contacts c
WHERE c.firm_id = v_firm_id
  AND c.flags->>'is_supplier' = 'true';

END $$;

SELECT 'Accounting defaults seeded ✓' AS status,
       (SELECT count(*) FROM accounting.account_heads) AS heads,
       (SELECT count(*) FROM accounting.account_groups) AS groups,
       (SELECT count(*) FROM accounting.sub_groups) AS sub_groups,
       (SELECT count(*) FROM accounting.ledgers) AS ledgers;
