-- ============================================================================
-- Namokara Suite — HR Defaults
-- Policy, holidays, salary structures + link demo users as employees
-- ============================================================================

DO $$
DECLARE
    v_firm_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    v_branch_jpr UUID := 'b1111111-1111-1111-1111-111111111111';

    v_struct_basic UUID;
    v_struct_mid UUID;
    v_struct_senior UUID;

    v_user_owner UUID := 'c1111111-1111-1111-1111-111111111111';
    v_user_admin UUID := 'c2222222-2222-2222-2222-222222222222';
    v_user_staff UUID := 'c3333333-3333-3333-3333-333333333333';

    v_contact_owner UUID;
    v_contact_admin UUID;
    v_contact_staff UUID;

    v_emp_owner UUID;
    v_emp_admin UUID;
    v_emp_staff UUID;
    v_current_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
    -- =================================================
    -- Attendance Policy
    -- =================================================
    INSERT INTO hr.attendance_policies (firm_id, branch_id, name, work_start_time, work_end_time, late_grace_min, weekend_days, half_day_weekends)
    VALUES (v_firm_id, v_branch_jpr, 'Default 9:30-6:30',
            '09:30:00', '18:30:00', 15,
            '[0]'::jsonb,    -- Sunday off
            '[1, 3]'::jsonb)  -- 1st & 3rd Saturday half day
    ON CONFLICT DO NOTHING;

    -- =================================================
    -- Holidays 2026 (sample for India)
    -- =================================================
    INSERT INTO hr.holidays (firm_id, holiday_date, name, holiday_type) VALUES
    (v_firm_id, '2026-01-26', 'Republic Day',     'mandatory'),
    (v_firm_id, '2026-03-14', 'Holi',             'mandatory'),
    (v_firm_id, '2026-03-31', 'Eid-ul-Fitr',      'optional'),
    (v_firm_id, '2026-04-14', 'Ambedkar Jayanti', 'optional'),
    (v_firm_id, '2026-08-15', 'Independence Day', 'mandatory'),
    (v_firm_id, '2026-08-19', 'Raksha Bandhan',   'optional'),
    (v_firm_id, '2026-10-02', 'Gandhi Jayanti',   'mandatory'),
    (v_firm_id, '2026-10-21', 'Dussehra',         'mandatory'),
    (v_firm_id, '2026-11-09', 'Diwali',           'mandatory'),
    (v_firm_id, '2026-12-25', 'Christmas',        'optional')
    ON CONFLICT DO NOTHING;

    -- =================================================
    -- Salary Structures
    -- =================================================
    INSERT INTO hr.salary_structures (firm_id, name, monthly_ctc, basic_percent, hra_percent, components, pf_applicable, esi_applicable)
    VALUES
    (v_firm_id, 'Basic ₹15,000 CTC', 15000, 50, 20, '{"special": 1500, "conveyance": 1600, "medical": 1250}'::jsonb, TRUE, TRUE),
    (v_firm_id, 'Mid ₹35,000 CTC',   35000, 45, 20, '{"special": 5000, "conveyance": 1600, "medical": 1250}'::jsonb, TRUE, FALSE),
    (v_firm_id, 'Senior ₹75,000 CTC', 75000, 40, 20, '{"special": 18000, "conveyance": 2000, "medical": 1500}'::jsonb, TRUE, FALSE);

    SELECT id INTO v_struct_basic FROM hr.salary_structures WHERE firm_id = v_firm_id AND name = 'Basic ₹15,000 CTC';
    SELECT id INTO v_struct_mid FROM hr.salary_structures WHERE firm_id = v_firm_id AND name = 'Mid ₹35,000 CTC';
    SELECT id INTO v_struct_senior FROM hr.salary_structures WHERE firm_id = v_firm_id AND name = 'Senior ₹75,000 CTC';

    -- =================================================
    -- Get contact IDs from existing users
    -- =================================================
    -- Owner contact (Rajesh)
    INSERT INTO core.contacts (firm_id, display_name, entity_type, phone_primary, email_primary, flags, source_module, created_by, addresses)
    SELECT v_firm_id, u.full_name, 'individual', u.phone, u.email,
           '{"is_employee":true}'::jsonb, 'hr', u.id,
           '[{"city":"Jaipur","state":"Rajasthan"}]'::jsonb
    FROM core.users u
    WHERE u.id = v_user_owner
      AND NOT EXISTS (
          SELECT 1 FROM core.contacts c
          WHERE c.firm_id = v_firm_id AND c.flags->>'is_employee' = 'true'
            AND c.display_name = u.full_name
      );
    SELECT id INTO v_contact_owner FROM core.contacts
    WHERE firm_id = v_firm_id AND flags->>'is_employee' = 'true' AND created_by = v_user_owner LIMIT 1;

    INSERT INTO core.contacts (firm_id, display_name, entity_type, phone_primary, email_primary, flags, source_module, created_by, addresses)
    SELECT v_firm_id, u.full_name, 'individual', u.phone, u.email,
           '{"is_employee":true}'::jsonb, 'hr', u.id,
           '[{"city":"Jaipur","state":"Rajasthan"}]'::jsonb
    FROM core.users u
    WHERE u.id = v_user_admin
      AND NOT EXISTS (
          SELECT 1 FROM core.contacts c
          WHERE c.firm_id = v_firm_id AND c.flags->>'is_employee' = 'true'
            AND c.display_name = u.full_name
      );
    SELECT id INTO v_contact_admin FROM core.contacts
    WHERE firm_id = v_firm_id AND flags->>'is_employee' = 'true' AND created_by = v_user_admin LIMIT 1;

    INSERT INTO core.contacts (firm_id, display_name, entity_type, phone_primary, email_primary, flags, source_module, created_by, addresses)
    SELECT v_firm_id, u.full_name, 'individual', u.phone, u.email,
           '{"is_employee":true}'::jsonb, 'hr', u.id,
           '[{"city":"Jaipur","state":"Rajasthan"}]'::jsonb
    FROM core.users u
    WHERE u.id = v_user_staff
      AND NOT EXISTS (
          SELECT 1 FROM core.contacts c
          WHERE c.firm_id = v_firm_id AND c.flags->>'is_employee' = 'true'
            AND c.display_name = u.full_name
      );
    SELECT id INTO v_contact_staff FROM core.contacts
    WHERE firm_id = v_firm_id AND flags->>'is_employee' = 'true' AND created_by = v_user_staff LIMIT 1;

    -- =================================================
    -- Create employee profiles
    -- =================================================
    INSERT INTO hr.employee_profiles (firm_id, contact_id, user_id, employee_code, designation, department, joining_date, salary_structure_id, branch_id, bank_name, pf_number, is_active)
    VALUES
    (v_firm_id, v_contact_owner, v_user_owner, 'EMP-001', 'CEO / Owner',     'Management', '2023-04-01', v_struct_senior, v_branch_jpr, 'HDFC Bank', 'RJ/JPR/0000001', TRUE),
    (v_firm_id, v_contact_admin, v_user_admin, 'EMP-002', 'Operations Lead', 'Operations', '2023-08-15', v_struct_mid,    v_branch_jpr, 'ICICI Bank', 'RJ/JPR/0000002', TRUE),
    (v_firm_id, v_contact_staff, v_user_staff, 'EMP-003', 'Sales Executive', 'Sales',      '2024-01-10', v_struct_basic,  v_branch_jpr, 'SBI',        'RJ/JPR/0000003', TRUE)
    ON CONFLICT (firm_id, employee_code) DO NOTHING;

    SELECT id INTO v_emp_owner FROM hr.employee_profiles WHERE firm_id = v_firm_id AND employee_code = 'EMP-001';
    SELECT id INTO v_emp_admin FROM hr.employee_profiles WHERE firm_id = v_firm_id AND employee_code = 'EMP-002';
    SELECT id INTO v_emp_staff FROM hr.employee_profiles WHERE firm_id = v_firm_id AND employee_code = 'EMP-003';

    -- =================================================
    -- Initial Leave Balances (current year)
    -- =================================================
    INSERT INTO hr.leave_balances (employee_id, year, leave_type, total_allocated, used) VALUES
    (v_emp_owner, v_current_year, 'sick',    12, 0),
    (v_emp_owner, v_current_year, 'casual',  12, 0),
    (v_emp_owner, v_current_year, 'earned',  21, 0),
    (v_emp_admin, v_current_year, 'sick',    12, 0),
    (v_emp_admin, v_current_year, 'casual',  12, 0),
    (v_emp_admin, v_current_year, 'earned',  21, 0),
    (v_emp_staff, v_current_year, 'sick',    12, 0),
    (v_emp_staff, v_current_year, 'casual',  12, 0),
    (v_emp_staff, v_current_year, 'earned',  15, 0)
    ON CONFLICT (employee_id, year, leave_type) DO NOTHING;

END $$;

SELECT 'HR defaults seeded ✓' AS status,
       (SELECT count(*) FROM hr.attendance_policies) AS policies,
       (SELECT count(*) FROM hr.holidays) AS holidays,
       (SELECT count(*) FROM hr.salary_structures) AS structures,
       (SELECT count(*) FROM hr.employee_profiles) AS employees,
       (SELECT count(*) FROM hr.leave_balances) AS leave_balances;
