-- ============================================================================
-- 119: MANUFACTURER — 84 permission + 6 role
-- ============================================================================
-- Format wahi jo poore app me chal raha hai: module.resource.action.scope
--
--   6 module × 21 resource × 4 action = 84 permission
--
-- Scope manufacturer ke liye teen:
--   self   sirf apna banaya hua      (salesman apne hi order dekhe)
--   place  apne godown/office ka     (godown wala apni jagah ka maal)
--   firm   poori firm ka             (malik, munim)
--
-- 'place' naya hai — agency me 'branch' tha. Manufacturer me jagah godown
-- hoti hai, branch nahi. Matlab dono ka ek: "apni jagah".
--
-- AADMI KO SEEDHA PERMISSION NAHI MILTI — ROLE MILTA HAI.
-- Role me tick badlo to us role ke saare log apne aap badal jaate hain.
-- Ek-ek aadmi par tick lagate to 20 aadmi ke baad sambhalna namumkin ho jata.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Module — permission ka FK isi par lagta hai
-- ----------------------------------------------------------------------------
INSERT INTO core.modules (code, name, icon, sort_order) VALUES
  ('sales',      'Sales & Delivery',   'receipt',      12),
  ('purchase',   'Purchase & Inwards', 'shopping-bag', 13),
  ('production', 'Production',         'factory',      14),
  ('stock',      'Stock',              'package',      15),
  ('masters',    'Masters',            'users',        16)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. 84 permission — ek hi loop se, taaki ek bhi na chhoote
--    (haath se 84 line likhte to koi na koi action bhool jata, aur bhooli
--     hui permission ka pata tab chalta hai jab user atak jata hai)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    m      RECORD;
    i      INT;
    res    TEXT;
    res_hi TEXT;
    act    TEXT;
    act_hi TEXT;
BEGIN
    FOR m IN
        SELECT * FROM (VALUES
          ('sales',      ARRAY['order','challan','invoice','sreturn'],
                         ARRAY['Sales Order','Delivery Challan','Tax Invoice','Sales Return'],
                         'place'),
          ('purchase',   ARRAY['po','inward','preturn'],
                         ARRAY['Purchase Order','Purchase Inward','Purchase Return'],
                         'place'),
          ('production', ARRAY['jobslip','khata'],
                         ARRAY['Job Slip','Karigar ka khata'],
                         'place'),
          ('stock',      ARRAY['design','material','rate'],
                         ARRAY['Design','Material','Rate / daam'],
                         'firm'),
          ('masters',    ARRAY['customer','supplier','karigar','agent','office','team'],
                         ARRAY['Customers','Suppliers','Karigars','Agents','Offices / Godowns','Team & Role'],
                         'firm'),
          ('reports',    ARRAY['sales','stock','outstanding'],
                         ARRAY['Bikri ki report','Stock report','Bakaya / udhaar'],
                         'firm')
        ) AS t(module, resources, labels, default_scope)
    LOOP
        FOR i IN 1 .. array_length(m.resources, 1) LOOP
            res    := m.resources[i];
            res_hi := m.labels[i];

            FOREACH act IN ARRAY ARRAY['view','create','edit','delete'] LOOP
                act_hi := CASE act
                            WHEN 'view'   THEN 'dekhe'
                            WHEN 'create' THEN 'banaye'
                            WHEN 'edit'   THEN 'badle'
                            WHEN 'delete' THEN 'mitaye'
                          END;

                INSERT INTO core.permissions (code, module, resource, action, scope, description)
                VALUES (m.module || '.' || res || '.' || act || '.' || m.default_scope,
                        m.module, res, act, m.default_scope,
                        res_hi || ' ' || act_hi)
                ON CONFLICT (code) DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Role — 6 banaye-banaye. is_system = TRUE matlab BADLE NAHI JA SAKTE.
--    Warna koi galti se Malik ki permission hata deta aur firm apne hi app
--    se bahar ho jati.
-- ----------------------------------------------------------------------------
INSERT INTO core.roles (firm_id, code, name, is_system, color, sort_order) VALUES
  (NULL, 'mfg_malik',    'Malik',               TRUE, '#4B1E78', 10),
  (NULL, 'mfg_manager',  'Manager',             TRUE, '#A8324B', 11),
  (NULL, 'mfg_munim',    'Munim (hisab-kitab)', TRUE, '#E94B5F', 12),
  (NULL, 'mfg_salesman', 'Salesman',            TRUE, '#F5A623', 13),
  (NULL, 'mfg_godown',   'Godown wala',         TRUE, '#2F6B3A', 14),
  (NULL, 'mfg_viewer',   'Sirf dekhne wala',    TRUE, '#9CA3AF', 15)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Kis role ko kya milega
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    mods TEXT[] := ARRAY['sales','purchase','production','stock','masters','reports'];
BEGIN
    -- MALIK — sab kuch
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM core.roles r, core.permissions p
     WHERE r.code = 'mfg_malik' AND p.module = ANY (mods)
    ON CONFLICT DO NOTHING;

    -- SIRF DEKHNE WALA — har cheez ka view, aur kuch nahi
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM core.roles r, core.permissions p
     WHERE r.code = 'mfg_viewer' AND p.module = ANY (mods) AND p.action = 'view'
    ON CONFLICT DO NOTHING;

    -- MANAGER — sab dekhe, roz ka kaam kare, MITAYE kuch nahi.
    -- Mitane ka haq jaan-boojh kar nahi diya: galti se bill mit gaya to
    -- number me gap ban jata hai aur GST me sawal khada hota hai.
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM core.roles r, core.permissions p
     WHERE r.code = 'mfg_manager' AND p.module = ANY (mods)
       AND (p.action = 'view'
         OR (p.action IN ('create','edit')
             AND NOT (p.module = 'masters' AND p.resource = 'team')))
    ON CONFLICT DO NOTHING;

    -- MUNIM — hisab-kitab. Bill aur inward banaye, production ko haath na lagaye.
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM core.roles r, core.permissions p
     WHERE r.code = 'mfg_munim' AND p.module = ANY (mods)
       AND (p.action = 'view'
         OR (p.action IN ('create','edit')
             AND ((p.module = 'sales'    AND p.resource IN ('invoice','sreturn'))
               OR (p.module = 'purchase' AND p.resource IN ('inward','preturn')))))
    ON CONFLICT DO NOTHING;

    -- SALESMAN — sirf apna. Bakaya dikhega (uske bina order lena mushkil hai).
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM core.roles r, core.permissions p
     WHERE r.code = 'mfg_salesman'
       AND ((p.module = 'sales'   AND p.resource = 'order' AND p.action IN ('view','create','edit'))
         OR (p.module = 'sales'   AND p.resource IN ('challan','invoice') AND p.action = 'view')
         OR (p.module = 'stock'   AND p.action = 'view')
         OR (p.module = 'masters' AND p.resource = 'customer' AND p.action IN ('view','create'))
         OR (p.module = 'reports' AND p.resource IN ('sales','outstanding') AND p.action = 'view'))
    ON CONFLICT DO NOTHING;

    -- GODOWN WALA — maal aana-jaana. Rate aur bakaya NAHI dikhega.
    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM core.roles r, core.permissions p
     WHERE r.code = 'mfg_godown'
       AND ((p.module = 'sales'      AND p.resource = 'challan' AND p.action IN ('view','create'))
         OR (p.module = 'purchase'   AND p.resource = 'inward'  AND p.action IN ('view','create'))
         OR (p.module = 'production' AND p.resource = 'jobslip' AND p.action = 'view')
         OR (p.module = 'stock'      AND p.resource = 'design'   AND p.action = 'view')
         OR (p.module = 'stock'      AND p.resource = 'material' AND p.action IN ('view','edit'))
         OR (p.module = 'reports'    AND p.resource = 'stock'    AND p.action = 'view'))
    ON CONFLICT DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 5. PURANI FIRMS KA OWNER — nayi permission unhe bhi milni chahiye
--
-- CreateFirm nayi firm ke owner ko "saari permission" deta hai, par wo
-- SAARI us waqt ki hoti hain. Jo firms pehle ban chuki hain unke firm_owner
-- role me ye 84 nayi permission jud-egi hi nahi — aur malik apne hi app me
-- kuch nahi kar payega. Isliye yahan jod dete hain.
-- ----------------------------------------------------------------------------
-- ⚠️ RLS ka pech — ise samajhna zaroori hai:
--
-- core.roles ki policy hai:
--   USING (firm_id = core.current_firm_id() OR (firm_id IS NULL AND is_system))
--
-- Migration chalte waqt current_firm_id KHALI hota hai. Mere 6 naye role to
-- firm_id NULL + is_system hain, isliye wo dikhte hain — par `firm_owner`
-- role HAR FIRM KA APNA hota hai (firm_id bharaa hua). Matlab yahan wo dikhta
-- hi nahi, aur seedha INSERT ... SELECT chup-chaap 0 row karta.
--
-- Aur prod me migration app-user (namokara_app) se chalti hai, jo DB ka
-- OWNER hai — aur FORCE ROW LEVEL SECURITY owner par bhi lagti hai. Isliye
-- "superuser bypass kar dega" wali umeed bhi kaam nahi aayegi.
--
-- Owner ke paas ek hi seedha rasta hai: is ek kaam ke liye FORCE hata do,
-- kaam karo, aur turant wapas laga do. EXCEPTION me bhi wapas lagta hai —
-- warna ek fail hui migration RLS band chhod jaati aur poora tenant
-- isolation khul jata.
DO $$
DECLARE owners INT; added INT;
BEGIN
    ALTER TABLE core.roles NO FORCE ROW LEVEL SECURITY;

    SELECT count(*) INTO owners FROM core.roles WHERE code = 'firm_owner';

    INSERT INTO core.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
      FROM core.roles r
      CROSS JOIN core.permissions p
     WHERE r.code = 'firm_owner'
       AND p.module IN ('sales','purchase','production','stock','masters','reports')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;

    ALTER TABLE core.roles FORCE ROW LEVEL SECURITY;

    RAISE NOTICE 'Purani firms: % firm_owner role mile, % nayi ijazat judi', owners, added;
EXCEPTION WHEN OTHERS THEN
    -- Kuch bhi bigde to RLS wapas chalu — ye chhodna sabse khatarnak hoga
    ALTER TABLE core.roles FORCE ROW LEVEL SECURITY;
    RAISE;
END $$;

-- Pakka karo ki FORCE wapas lagi hai — ye line kabhi fail nahi honi chahiye
DO $$
BEGIN
    IF NOT (SELECT relforcerowsecurity FROM pg_class
             WHERE oid = 'core.roles'::regclass) THEN
        RAISE EXCEPTION 'core.roles par FORCE ROW LEVEL SECURITY wapas nahi lagi — '
                        'turant lagaiye, warna firms ka data mil sakta hai';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Ginti — jo bana wo dikha do
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD; total INT;
BEGIN
    SELECT count(*) INTO total FROM core.permissions
     WHERE module IN ('sales','purchase','production','stock','masters','reports');
    RAISE NOTICE 'Manufacturer permission: % (84 hone chahiye)', total;

    FOR r IN
        SELECT ro.name, count(rp.permission_id) AS n
          FROM core.roles ro
          LEFT JOIN core.role_permissions rp ON rp.role_id = ro.id
         WHERE ro.code LIKE 'mfg\_%'
         GROUP BY ro.name ORDER BY n DESC
    LOOP
        RAISE NOTICE '  % → % ijazat', r.name, r.n;
    END LOOP;
END $$;

SELECT 'manufacturer permissions tayyar ✓' AS status;
