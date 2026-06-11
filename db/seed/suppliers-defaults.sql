-- ============================================================================
-- Namokara Suite — Suppliers Defaults
-- 27 default fabric/textile categories + supplier profiles from existing contacts
-- ============================================================================

DO $$
DECLARE
    v_firm_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
    -- 27 standard fabric categories (from supplier app)
    INSERT INTO suppliers.categories (firm_id, name, sort_order, is_system) VALUES
    (v_firm_id, 'Saree', 1, TRUE),
    (v_firm_id, 'Suit Material', 2, TRUE),
    (v_firm_id, 'Kurti', 3, TRUE),
    (v_firm_id, 'Dress Material', 4, TRUE),
    (v_firm_id, 'Silk', 5, TRUE),
    (v_firm_id, 'Cotton', 6, TRUE),
    (v_firm_id, 'Linen', 7, TRUE),
    (v_firm_id, 'Polyester', 8, TRUE),
    (v_firm_id, 'Chiffon', 9, TRUE),
    (v_firm_id, 'Georgette', 10, TRUE),
    (v_firm_id, 'Crepe', 11, TRUE),
    (v_firm_id, 'Velvet', 12, TRUE),
    (v_firm_id, 'Net', 13, TRUE),
    (v_firm_id, 'Embroidery Fabric', 14, TRUE),
    (v_firm_id, 'Bandhani', 15, TRUE),
    (v_firm_id, 'Banarasi', 16, TRUE),
    (v_firm_id, 'Chanderi', 17, TRUE),
    (v_firm_id, 'Maheshwari', 18, TRUE),
    (v_firm_id, 'Tussar', 19, TRUE),
    (v_firm_id, 'Khadi', 20, TRUE),
    (v_firm_id, 'Block Print', 21, TRUE),
    (v_firm_id, 'Digital Print', 22, TRUE),
    (v_firm_id, 'Lehenga', 23, TRUE),
    (v_firm_id, 'Sherwani', 24, TRUE),
    (v_firm_id, 'Curtain', 25, TRUE),
    (v_firm_id, 'Bedsheet', 26, TRUE),
    (v_firm_id, 'Cushion Cover', 27, TRUE)
    ON CONFLICT (firm_id, name) DO NOTHING;

    -- Auto-create supplier profiles from is_supplier contacts
    INSERT INTO suppliers.supplier_profiles (
        firm_id, contact_id, supplier_code, business_type,
        rate_unit, wa_phone, reliability_score, min_order_value,
        delivery_lead_days, is_active
    )
    SELECT
        v_firm_id,
        c.id,
        'SUP-' || lpad((row_number() OVER (ORDER BY c.created_at))::text, 3, '0'),
        'manufacturer',
        'mtr',
        c.phone_primary,
        4.5, 5000, 7, TRUE
    FROM core.contacts c
    WHERE c.firm_id = v_firm_id
      AND c.flags->>'is_supplier' = 'true'
    ON CONFLICT (firm_id, contact_id) DO NOTHING;

END $$;

SELECT 'Suppliers defaults seeded ✓' AS status,
       (SELECT count(*) FROM suppliers.categories) AS categories,
       (SELECT count(*) FROM suppliers.supplier_profiles) AS suppliers;
