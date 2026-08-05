-- ============================================================================
-- 129: LOGIN TOOT GAYA THA — audit_logs ki policy se
-- ============================================================================
-- Migration 127 ne platform.audit_logs par RLS ENABLE kiya. Policy pehle se
-- likhi hui thi, par RLS band hone ki wajah se wo kabhi lagi hi nahi thi —
-- enable karte hi pehli baar chali, aur LOGIN tootT gaya:
--
--     42501: new row violates row-level security policy for table "audit_logs"
--
-- Wajah saaf hai: login ke waqt aadmi abhi authenticate hua hi nahi hota,
-- isliye `app.current_firm_id` set nahi hoti. Policy ki shart
-- `firm_id = core.current_firm_id()` me current_firm_id() NULL hai — NULL se
-- barabari kabhi sach nahi hoti — to WITH CHECK fail ho gaya aur login ka
-- audit likhte hi poori request gir gayi.
--
-- Ye galti meri thi: 127 me maine har table ka istemaal padha, par audit_logs
-- ko "policy pehle se hai, sirf ENABLE karna hai" samajh kar chhod diya. Wahi
-- ek table thi jispar bina firm context ke likha jata hai.
--
-- ILAAJ — padhne aur likhne ke niyam alag:
--   PADHNA  (USING)      : sakht hi rahega. Apni firm ka audit apni firm ko,
--                          super admin ko sab. Kisi ke login ka byora doosri
--                          firm ko nahi dikhna chahiye.
--   LIKHNA  (WITH CHECK) : jab koi firm context hai HI NAHI (login, logout,
--                          galat password) tab likhne dena — warna wo ghatna
--                          kabhi record hi nahi hogi, aur audit ka matlab hi
--                          yahi hai ki aisi ghatnaayein bachein.
-- ============================================================================

DROP POLICY IF EXISTS firm_isolation_platform_audit_logs ON platform.audit_logs;

CREATE POLICY firm_isolation_platform_audit_logs ON platform.audit_logs
    -- Padhna: sirf apni firm ka (super admin ko sab)
    USING (
        firm_id = core.current_firm_id()
        OR current_setting('app.is_platform_admin', true) = 'true'
    )
    -- Likhna: apni firm ka, YA jab koi firm context hi na ho (login se pehle)
    WITH CHECK (
        firm_id = core.current_firm_id()
        OR core.current_firm_id() IS NULL
        OR current_setting('app.is_platform_admin', true) = 'true'
    );

COMMENT ON POLICY firm_isolation_platform_audit_logs ON platform.audit_logs IS
  'Padhna sakht (apni firm / super admin). Likhna tab bhi jab firm context na '
  'ho — login, logout aur galat-password ki ghatna bina context ke aati hai '
  'aur usi ko bachana audit ka asli kaam hai. (db/init/129)';

-- ── jaanch: bina firm context ke likha jaa raha hai ya nahi ──
DO $$
DECLARE ok BOOLEAN;
BEGIN
    SET LOCAL ROLE namokara_app;
    PERFORM set_config('app.current_firm_id', '', true);   -- context hai hi nahi

    BEGIN
        INSERT INTO platform.audit_logs (firm_id, action, entity_type)
        VALUES (NULL, 'jaanch.login', 'test');
        ok := TRUE;
        DELETE FROM platform.audit_logs WHERE action = 'jaanch.login';
    EXCEPTION WHEN insufficient_privilege THEN
        ok := FALSE;
    END;

    RESET ROLE;
    IF ok THEN
        RAISE NOTICE 'Login ka audit ab likha ja sakta hai ✓';
    ELSE
        RAISE EXCEPTION 'Login abhi bhi tootega — policy ne likhne nahi diya';
    END IF;
END $$;

SELECT 'audit log login fix ✓' AS status;
