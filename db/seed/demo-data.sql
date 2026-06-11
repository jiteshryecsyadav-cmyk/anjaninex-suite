-- ============================================================================
-- Namokara Suite — Demo Data Seed
-- Run after init scripts: psql -U namokara -d namokara_dev -f demo-data.sql
-- ============================================================================

-- Get plan IDs
DO $$
DECLARE
    v_pro_plan_id UUID;
    v_firm_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    v_branch_jpr UUID := 'b1111111-1111-1111-1111-111111111111';
    v_branch_del UUID := 'b2222222-2222-2222-2222-222222222222';
    v_branch_mum UUID := 'b3333333-3333-3333-3333-333333333333';
    v_user_owner UUID := 'c1111111-1111-1111-1111-111111111111';
    v_user_admin UUID := 'c2222222-2222-2222-2222-222222222222';
    v_user_staff UUID := 'c3333333-3333-3333-3333-333333333333';
    v_user_super UUID := 'c0000000-0000-0000-0000-000000000000';
BEGIN
    SELECT id INTO v_pro_plan_id FROM platform.subscription_plans WHERE code = 'pro';

    -- ========================================
    -- DEMO FIRM: Namokara Agencies
    -- ========================================
    INSERT INTO platform.firms (
        id, name, legal_name, gst_number, pan_number, industry,
        city, state, contact_email, contact_phone, plan_id,
        wallet_balance, status, activated_at
    ) VALUES (
        v_firm_id, 'Namokara Agencies (DEMO)', 'Namokara Agencies Pvt Ltd',
        '08AABCN1234A1Z5', 'AABCN1234A', 'Trading',
        'Jaipur', 'Rajasthan', 'admin@namokara.demo', '+919876543210',
        v_pro_plan_id, 10000.00, 'active', now()
    ) ON CONFLICT (id) DO NOTHING;

    -- Initial wallet entry
    INSERT INTO platform.wallet_ledger (firm_id, txn_type, amount, balance_after, description)
    VALUES (v_firm_id, 'recharge', 10000.00, 10000.00, 'Demo data initial credit');

    -- ========================================
    -- BRANCHES
    -- ========================================
    INSERT INTO core.branches (id, firm_id, code, name, city, state, gst_state_code, bill_prefix, voucher_prefix, is_head_office) VALUES
    (v_branch_jpr, v_firm_id, 'JPR', 'Jaipur HQ',  'Jaipur', 'Rajasthan',  '08', 'JPR-BILL-', 'JPR-V-', TRUE),
    (v_branch_del, v_firm_id, 'DEL', 'Delhi',      'Delhi',  'Delhi',      '07', 'DEL-BILL-', 'DEL-V-', FALSE),
    (v_branch_mum, v_firm_id, 'MUM', 'Mumbai',     'Mumbai', 'Maharashtra','27', 'MUM-BILL-', 'MUM-V-', FALSE)
    ON CONFLICT DO NOTHING;

    -- ========================================
    -- USERS (passwords: all are "Demo@123")
    -- bcrypt hash of 'Demo@123' with cost 12:
    -- $2a$12$LQv3c1yqBwlVHpPjrxoOFOPdZ1cFOQNRsLR.cSXn4hRvHVKwBVxmK
    -- ========================================

    -- Anjaninex Super Admin (firm_id NULL)
    INSERT INTO core.users (id, firm_id, username, email, full_name, password_hash, is_active) VALUES
    (v_user_super, NULL, 'anjaninex', 'super@anjaninex.com', 'Anjaninex Super Admin',
     '$2a$12$LQv3c1yqBwlVHpPjrxoOFOPdZ1cFOQNRsLR.cSXn4hRvHVKwBVxmK', TRUE)
    ON CONFLICT DO NOTHING;
    INSERT INTO core.user_roles (user_id, role_id)
    SELECT v_user_super, id FROM core.roles WHERE code = 'super_admin'
    ON CONFLICT DO NOTHING;

    -- Firm Owner
    INSERT INTO core.users (id, firm_id, username, email, full_name, password_hash, default_branch_id, can_view_all_branches, is_active) VALUES
    (v_user_owner, v_firm_id, 'rajesh', 'rajesh@namokara.demo', 'Rajesh Yadav (Owner)',
     '$2a$12$LQv3c1yqBwlVHpPjrxoOFOPdZ1cFOQNRsLR.cSXn4hRvHVKwBVxmK', v_branch_jpr, TRUE, TRUE)
    ON CONFLICT DO NOTHING;
    INSERT INTO core.user_roles (user_id, role_id)
    SELECT v_user_owner, id FROM core.roles WHERE code = 'firm_owner'
    ON CONFLICT DO NOTHING;
    INSERT INTO core.user_branch_access (user_id, branch_id, is_default) VALUES
    (v_user_owner, v_branch_jpr, TRUE), (v_user_owner, v_branch_del, FALSE), (v_user_owner, v_branch_mum, FALSE)
    ON CONFLICT DO NOTHING;

    -- Firm Admin
    INSERT INTO core.users (id, firm_id, username, email, full_name, password_hash, default_branch_id, is_active) VALUES
    (v_user_admin, v_firm_id, 'admin', 'admin@namokara.demo', 'Admin User',
     '$2a$12$LQv3c1yqBwlVHpPjrxoOFOPdZ1cFOQNRsLR.cSXn4hRvHVKwBVxmK', v_branch_jpr, TRUE)
    ON CONFLICT DO NOTHING;
    INSERT INTO core.user_roles (user_id, role_id)
    SELECT v_user_admin, id FROM core.roles WHERE code = 'firm_admin'
    ON CONFLICT DO NOTHING;
    INSERT INTO core.user_branch_access (user_id, branch_id, is_default) VALUES
    (v_user_admin, v_branch_jpr, TRUE) ON CONFLICT DO NOTHING;

    -- Staff
    INSERT INTO core.users (id, firm_id, username, email, full_name, password_hash, default_branch_id, is_active) VALUES
    (v_user_staff, v_firm_id, 'asha', 'asha@namokara.demo', 'Asha (Staff)',
     '$2a$12$LQv3c1yqBwlVHpPjrxoOFOPdZ1cFOQNRsLR.cSXn4hRvHVKwBVxmK', v_branch_jpr, TRUE)
    ON CONFLICT DO NOTHING;
    INSERT INTO core.user_roles (user_id, role_id)
    SELECT v_user_staff, id FROM core.roles WHERE code = 'staff'
    ON CONFLICT DO NOTHING;
    INSERT INTO core.user_branch_access (user_id, branch_id, is_default) VALUES
    (v_user_staff, v_branch_jpr, TRUE) ON CONFLICT DO NOTHING;

    -- ========================================
    -- DEPARTMENTS
    -- ========================================
    INSERT INTO core.departments (firm_id, branch_id, name, code) VALUES
    (v_firm_id, v_branch_jpr, 'Sales',    'SALES'),
    (v_firm_id, v_branch_jpr, 'Accounts', 'ACCT'),
    (v_firm_id, v_branch_jpr, 'HR',       'HR'),
    (v_firm_id, v_branch_del, 'Sales',    'SALES'),
    (v_firm_id, v_branch_mum, 'Sales',    'SALES')
    ON CONFLICT DO NOTHING;

    -- ========================================
    -- SAMPLE CONTACTS (parties + suppliers)
    -- ========================================
    INSERT INTO core.contacts (firm_id, display_name, legal_name, entity_type, phone_primary, email_primary, gst_number, addresses, flags, source_module) VALUES
    (v_firm_id, 'Bawa Collection',  'Bawa Collection Pvt Ltd',   'pvt_ltd',  '+919811112222', 'bawa@example.com', '07ABCDE1234A1Z5',
     '[{"type":"billing","line1":"Karol Bagh","city":"Delhi","state":"Delhi","pincode":"110005"}]'::jsonb,
     '{"is_party":true,"is_buyer":true}'::jsonb, 'trading'),

    (v_firm_id, 'Parvati Export', 'Parvati Export', 'proprietorship', '+919822223333', 'parvati@example.com', '08PQRST5678B2Z6',
     '[{"type":"billing","line1":"Plot 14, Industrial Area","city":"Jaipur","state":"Rajasthan","pincode":"302001"}]'::jsonb,
     '{"is_supplier":true}'::jsonb, 'suppliers'),

    (v_firm_id, 'Sharma Brothers', 'Sharma Brothers Trading Co', 'partnership', '+919833334444', 'sharma@example.com', '08SHRMA9876C3Z7',
     '[{"type":"billing","line1":"Johari Bazaar","city":"Jaipur","state":"Rajasthan","pincode":"302003"}]'::jsonb,
     '{"is_party":true,"is_buyer":true}'::jsonb, 'trading'),

    (v_firm_id, 'Surat Silk Mills', 'Surat Silk Mills Pvt Ltd', 'pvt_ltd', '+919844445555', 'surat@example.com', '24SURAT5432D4Z8',
     '[{"type":"billing","line1":"Ring Road","city":"Surat","state":"Gujarat","pincode":"395003"}]'::jsonb,
     '{"is_supplier":true}'::jsonb, 'suppliers')
    ON CONFLICT DO NOTHING;

END $$;

SELECT 'Demo data seeded ✓' AS status,
       (SELECT count(*) FROM platform.firms) AS firms_count,
       (SELECT count(*) FROM core.users) AS users_count,
       (SELECT count(*) FROM core.branches) AS branches_count,
       (SELECT count(*) FROM core.contacts) AS contacts_count;
