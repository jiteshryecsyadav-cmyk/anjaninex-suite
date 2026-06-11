-- ============================================================================
-- Namokara Suite — Trading Defaults
-- Auto-create party profiles from contacts + sample items
-- ============================================================================

DO $$
DECLARE
    v_firm_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
    -- =============================================
    -- Auto-create party profiles for is_party contacts
    -- =============================================
    INSERT INTO trading.party_profiles (
        firm_id, contact_id, party_code, party_type,
        credit_limit, credit_days,
        opening_balance, opening_type, ledger_id
    )
    SELECT
        v_firm_id,
        c.id,
        'PRT-' || lpad((row_number() OVER (ORDER BY c.created_at))::text, 3, '0'),
        'buyer',
        50000.00, 30, 0, 'Dr',
        (SELECT l.id FROM accounting.ledgers l WHERE l.contact_id = c.id LIMIT 1)
    FROM core.contacts c
    WHERE c.firm_id = v_firm_id
      AND c.flags->>'is_party' = 'true'
    ON CONFLICT (firm_id, contact_id) DO NOTHING;

    -- =============================================
    -- Sample items (fabric trading)
    -- =============================================
    INSERT INTO trading.items (firm_id, code, name, hsn_sac, unit, default_rate, tax_rate, category) VALUES
    (v_firm_id, 'DSN-3030', 'Design 3030',  '63062200', 'PCS', 447.00, 5.00, 'Fabric'),
    (v_firm_id, 'KAR-100',  'Karina',       '63062200', 'PCS', 447.00, 5.00, 'Fabric'),
    (v_firm_id, 'DSN-2080', 'Design 2080',  '63062200', 'MTR', 250.00, 5.00, 'Fabric'),
    (v_firm_id, 'SIK-001',  'Silk Premium', '50071000', 'MTR', 850.00, 5.00, 'Silk'),
    (v_firm_id, 'COT-001',  'Cotton Plain', '52083900', 'MTR', 120.00, 5.00, 'Cotton'),
    (v_firm_id, 'KUR-RED',  'Kurti Red',    '61091000', 'PCS', 550.00, 12.00,'Apparel'),
    (v_firm_id, 'SAR-001',  'Saree Designer','58041000', 'PCS', 1250.00,12.00,'Apparel')
    ON CONFLICT (firm_id, code) DO NOTHING;
END $$;

SELECT 'Trading defaults seeded ✓' AS status,
       (SELECT count(*) FROM trading.party_profiles) AS parties,
       (SELECT count(*) FROM trading.items) AS items;
