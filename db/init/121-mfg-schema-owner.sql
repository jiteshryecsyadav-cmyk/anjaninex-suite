-- ============================================================================
-- 121: mfg schema ka maalik app-user ho — warna app use chhoo hi nahi sakti
-- ============================================================================
-- Karigars ki screen par "Security policy ne ye save block kiya (42501)" aa
-- raha tha. 42501 ka matlab dono ho sakta hai — RLS ne roka, YA schema par
-- haq hi nahi. Yahan doosri wali baat thi:
--
--     permission denied for schema mfg
--
-- Wajah: migration `postgres` (superuser) se chalayi thi, isliye mfg schema
-- aur uski saari table ka MAALIK postgres ban gaya. Par app `namokara_app`
-- se judti hai — aur usko is schema par kuch bhi karne ka haq nahi mila.
--
-- Baaki poori DB ka maalik namokara_app hi hai (02-db-setup.sh me DB usi ke
-- naam par banti hai). mfg bhi wahi hona chahiye — tabhi RLS ka FORCE bhi
-- waise hi chalega jaise doosri tables par chalta hai.
--
-- ⚠️ Ye file SUPERUSER se chalani padegi (sudo -u postgres) — owner badalne
--    ka haq sirf usi ke paas hai.
-- ============================================================================

DO $$
DECLARE
    app_role TEXT := 'namokara_app';
    obj      RECORD;
BEGIN
    -- Dev machine par role ka naam alag ho sakta hai — na mile to chhod do
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        RAISE NOTICE 'Role % nahi mila — chhod rahe hain (dev machine hogi)', app_role;
        RETURN;
    END IF;

    EXECUTE format('ALTER SCHEMA mfg OWNER TO %I', app_role);

    FOR obj IN
        SELECT c.relname, c.relkind
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'mfg'
           AND c.relkind IN ('r','p','v','S')      -- table, partition, view, sequence
           -- BIGSERIAL wali sequence table se BANDHI hoti hai; uska maalik alag
           -- se nahi badla ja sakta ("cannot change owner of sequence"). Table
           -- ka maalik badalte hi wo apne aap badal jati hai — isliye chhod do.
           AND NOT EXISTS (
                 SELECT 1 FROM pg_depend d
                  WHERE d.objid = c.oid AND d.deptype = 'a')
    LOOP
        IF obj.relkind IN ('r','p') THEN
            EXECUTE format('ALTER TABLE mfg.%I OWNER TO %I', obj.relname, app_role);
        ELSIF obj.relkind = 'v' THEN
            EXECUTE format('ALTER VIEW mfg.%I OWNER TO %I', obj.relname, app_role);
        ELSIF obj.relkind = 'S' THEN
            EXECUTE format('ALTER SEQUENCE mfg.%I OWNER TO %I', obj.relname, app_role);
        END IF;
    END LOOP;

    -- Haq bhi de do (owner ko waise to sab milta hai, par saaf likh dena behtar)
    EXECUTE format('GRANT USAGE ON SCHEMA mfg TO %I', app_role);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA mfg TO %I', app_role);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA mfg TO %I', app_role);

    -- Aage jo table banegi wo bhi apne aap app ko mile — warna agli migration
    -- ke baad phir yahi 42501 wapas aa jayega
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA mfg GRANT ALL ON TABLES TO %I', app_role);
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA mfg GRANT ALL ON SEQUENCES TO %I', app_role);

    RAISE NOTICE 'mfg schema ab % ka hai', app_role;
END $$;

-- Jaanch — kitni table app-user ki nahi hain
DO $$
DECLARE bad INT;
BEGIN
    SELECT count(*) INTO bad
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
     WHERE n.nspname = 'mfg' AND c.relkind IN ('r','p')
       AND r.rolname <> 'namokara_app'
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app');

    IF bad > 0 THEN
        RAISE EXCEPTION 'mfg ki % table ab bhi app-user ki nahi hain', bad;
    END IF;
END $$;

SELECT 'mfg schema owner theek ✓' AS status;
