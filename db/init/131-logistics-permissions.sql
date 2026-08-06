-- ============================================================================
-- 131: LOGISTICS — ijazat, role, aur module ka darwaza
-- ============================================================================
-- Wahi dhaancha jo mfg ka hai (migration 119). Teen cheezein:
--   1. Permission — `logistics.<cheez>.<kaam>.<hadd>`
--   2. Role — transport ke asli kaam ke hisaab se, na ki kitaabi
--   3. Module chalu — warna [ModuleAccess("logistics")] har API par 403 dega
--      aur screen par sirf "List nahi aa payi" dikhega (mfg me yahi hua tha)
--
-- HADD 'branch' hai, 'place' nahi. Transport har shehar par apna office
-- rakhta hai aur GR usi office ke naam se katta hai — Surat wale ko Jaipur
-- ka maal nahi dikhna chahiye. Ye `core.branches` se hi chalta hai.
-- ============================================================================

INSERT INTO core.modules (code, name, icon, sort_order) VALUES
  ('logistics', 'Logistics', 'truck', 17)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 1. Permission — har cheez par chaar kaam
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD; a TEXT; act_hi TEXT;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
          ('gr',       'Goods Receipt (GR)'),
          ('loading',  'Loading Book'),
          ('dispatch', 'Dispatch Challan'),
          ('inward',   'Inward Challan'),
          ('delivery', 'Delivery Receipt'),
          ('vehicle',  'Gaadi'),
          ('driver',   'Driver'),
          ('tbb',      'TBB Billing'),
          ('report',   'Reports')
        ) AS t(res, label)
    LOOP
        FOREACH a IN ARRAY ARRAY['view','create','edit','delete'] LOOP
            act_hi := CASE a WHEN 'view'   THEN 'dekhna'
                             WHEN 'create' THEN 'banana'
                             WHEN 'edit'   THEN 'badalna'
                             ELSE 'hatana' END;
            INSERT INTO core.permissions (code, module, name, description)
            VALUES ('logistics.' || r.res || '.' || a || '.branch',
                    'logistics',
                    r.label || ' — ' || act_hi,
                    r.label || ' ' || act_hi || ' (apni branch ka)')
            ON CONFLICT (code) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Role — transport me asli me jo log hote hain
-- ----------------------------------------------------------------------------
INSERT INTO core.roles (firm_id, code, name, is_system, color, sort_order) VALUES
  (NULL, 'log_malik',    'Malik',                TRUE, '#1B2E5C', 20),
  (NULL, 'log_manager',  'Branch Manager',       TRUE, '#A8324B', 21),
  (NULL, 'log_booking',  'Booking clerk',        TRUE, '#F5A623', 22),
  (NULL, 'log_ops',      'Operations / Dispatch',TRUE, '#2F6B3A', 23),
  (NULL, 'log_accounts', 'Accounts',             TRUE, '#0d9488', 24),
  (NULL, 'log_viewer',   'Sirf dekhne wala',     TRUE, '#9CA3AF', 25)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Kis role ko kya
--
--    Booking clerk sirf GR kaat sakta hai — gaadi/driver ka master nahi
--    chhed sakta. Ops maal chalata hai par rate nahi badal sakta. Accounts
--    bill banata hai par GR nahi kaat sakta. Yahi asli batwara hai.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    r_malik UUID; r_mgr UUID; r_book UUID; r_ops UUID; r_acc UUID; r_view UUID;
BEGIN
    SELECT id INTO r_malik FROM core.roles WHERE code='log_malik'    AND firm_id IS NULL;
    SELECT id INTO r_mgr   FROM core.roles WHERE code='log_manager'  AND firm_id IS NULL;
    SELECT id INTO r_book  FROM core.roles WHERE code='log_booking'  AND firm_id IS NULL;
    SELECT id INTO r_ops   FROM core.roles WHERE code='log_ops'      AND firm_id IS NULL;
    SELECT id INTO r_acc   FROM core.roles WHERE code='log_accounts' AND firm_id IS NULL;
    SELECT id INTO r_view  FROM core.roles WHERE code='log_viewer'   AND firm_id IS NULL;

    -- Malik + Manager: sab kuch
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r, p.id FROM core.permissions p, unnest(ARRAY[r_malik, r_mgr]) AS r
     WHERE p.module='logistics'
    ON CONFLICT DO NOTHING;

    -- Booking clerk: GR banana/badalna + baaki sirf dekhna
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r_book, p.id FROM core.permissions p
     WHERE p.module='logistics'
       AND (p.code LIKE 'logistics.gr.%' AND p.code NOT LIKE '%.delete.%'
            OR p.code LIKE '%.view.%')
    ON CONFLICT DO NOTHING;

    -- Ops: maal chalane wale saare kaagaz + gaadi/driver dekhna
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r_ops, p.id FROM core.permissions p
     WHERE p.module='logistics'
       AND (p.code LIKE 'logistics.loading.%'
            OR p.code LIKE 'logistics.dispatch.%'
            OR p.code LIKE 'logistics.inward.%'
            OR p.code LIKE 'logistics.delivery.%'
            OR p.code LIKE '%.view.%')
    ON CONFLICT DO NOTHING;

    -- Accounts: TBB bill + report, baaki dekhna
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r_acc, p.id FROM core.permissions p
     WHERE p.module='logistics'
       AND (p.code LIKE 'logistics.tbb.%'
            OR p.code LIKE 'logistics.report.%'
            OR p.code LIKE '%.view.%')
    ON CONFLICT DO NOTHING;

    -- Viewer: sirf dekhna
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r_view, p.id FROM core.permissions p
     WHERE p.module='logistics' AND p.code LIKE '%.view.%'
    ON CONFLICT DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Purani firm ke malik ko bhi nayi ijazat
--
--    core.roles par FORCE RLS hai. Ye migration postgres se chalti hai, par
--    FORCE maalik par bhi lagta hai — isliye der ke liye hatana padta hai.
--    EXCEPTION me wapas laga dete hain: bich me kuch toote to bhi table
--    khuli na reh jaye. (Migration 119 me yahi seekha tha.)
-- ----------------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    ALTER TABLE core.roles NO FORCE ROW LEVEL SECURITY;

    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
      FROM core.roles r
      JOIN platform.firms f ON f.id = r.firm_id
      CROSS JOIN core.permissions p
     WHERE r.code = 'firm_owner'
       AND f.business_kind IN ('transport', 'both')
       AND p.module = 'logistics'
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Purani transport firms ko % nayi ijazat mili', n;

    ALTER TABLE core.roles FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
    ALTER TABLE core.roles FORCE ROW LEVEL SECURITY;
    RAISE;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Module ka darwaza kholo
--
--    Bina iske [ModuleAccess("logistics")] har API par 403 dega, aur 403 ka
--    body khali hota hai — user ko sirf "List nahi aa payi" dikhta. mfg me
--    yahi ho chuka hai (migration 120), isliye is baar pehle hi.
-- ----------------------------------------------------------------------------
UPDATE platform.firms
   SET enabled_modules = COALESCE(enabled_modules, '{}'::jsonb)
                         || jsonb_build_object('logistics', true,
                                               'reports',   true,
                                               'masters',   true),
       updated_at = now()
 WHERE business_kind IN ('transport', 'both');

DO $$
DECLARE n INT; p INT;
BEGIN
    SELECT count(*) INTO p FROM core.permissions WHERE module = 'logistics';
    SELECT count(*) INTO n FROM platform.firms
     WHERE business_kind IN ('transport','both')
       AND enabled_modules @> '{"logistics": true}'::jsonb;
    RAISE NOTICE 'Logistics permission: % (36 hone chahiye) · module chalu: % firm par', p, n;
END $$;

SELECT 'logistics permission + role tayyar ✓' AS status;
