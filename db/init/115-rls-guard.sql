-- ============================================================================
-- 115: RLS PAHRA — koi bhi firm-wali table bina policy ke na bache
-- ============================================================================
-- Ye file koi feature nahi banati. Ye wo chhed band karti hai jisme se
-- `hr.location_trails` nikal gayi thi: RLS ENABLE tha par POLICY nahi thi,
-- aur Postgres bina policy ke sab kuch DENY kar deta hai — isliye mahino tak
-- har location ping chupchaap girti rahi aur kisi ko pata nahi chala.
--
-- Ulta bhi utna hi khatarnak hai: RLS enable hi na ho, to table SAB firms ko
-- dikh jayegi aur koi error bhi nahi aayega. Wahi hum roknaa chahte hain.
--
-- Niyam jo ab se pakka hai:
--   Jis table me `firm_id` column hai, uspar RLS ENABLE + FORCE aur kam se kam
--   ek policy honi CHAHIYE — ya phir core.rls_exempt me wajah likhi honi chahiye.
--
-- Teen jagah lagega:
--   1. Har nayi migration ke aakhir me  → SELECT core.assert_rls_policies(...)
--   2. API boot par                     → nahi to server chalu hi na ho
--   3. Nightly cron                     → koi haath se table bana de to bhi pakda jaye
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Chhoot ki list — har chhoot ki WAJAH likhni zaroori hai
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.rls_exempt (
    schema_name TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    reason      TEXT NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (schema_name, table_name)
);

COMMENT ON TABLE core.rls_exempt IS
  'Jin tables par jaan-boojh kar RLS nahi hai. Bina wajah ke entry mat daalna — '
  'ye list hi ek din audit me poochi jayegi.';

-- Credil network dataset hai — 70-credil.sql me saaf likha hai ki RLS
-- jaan-boojh kar nahi lagayi. Score GST par bandha hai, firm par nahi;
-- access controller me firm_id filter + platform permission se rukta hai.
INSERT INTO core.rls_exempt (schema_name, table_name, reason) VALUES
  ('credil','score_events',   'Network dataset — cross-firm score. App layer par control (70-credil.sql).'),
  ('credil','scores',         'Network dataset — cross-firm score.'),
  ('credil','report_requests','Network dataset — platform-managed.'),
  ('credil','group_members',  'Network dataset — platform-managed.')
ON CONFLICT (schema_name, table_name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Kahan-kahan chhed hai — ye view kabhi bhi dekha ja sakta hai
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW core.v_rls_gaps AS
SELECT n.nspname                                            AS schema_name,
       c.relname                                            AS table_name,
       c.relrowsecurity                                     AS rls_enabled,
       c.relforcerowsecurity                                AS rls_forced,
       EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS has_policy,
       CASE
         WHEN NOT c.relrowsecurity      THEN 'RLS ENABLE nahi hai — table SAB firms ko dikh rahi hai'
         WHEN NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
                                        THEN 'Policy nahi hai — har row DENY hogi (location_trails wali galti)'
         WHEN NOT c.relforcerowsecurity THEN 'FORCE nahi hai — table ka maalik RLS bypass kar sakta hai'
       END                                                  AS dikkat
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r','p')                   -- normal + partitioned
   AND n.nspname NOT IN ('pg_catalog','information_schema')
   -- Sirf wahi tables jinme firm ka data hai
   AND EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid
                  AND a.attname  = 'firm_id'
                  AND a.attnum   > 0
                  AND NOT a.attisdropped)
   -- Jinhe jaan-boojh kar chhoot di gayi hai unhe chhod do
   AND NOT EXISTS (SELECT 1 FROM core.rls_exempt e
                    WHERE e.schema_name = n.nspname
                      AND e.table_name  = c.relname)
   -- Aur inme se koi bhi kami ho
   AND (NOT c.relrowsecurity
     OR NOT c.relforcerowsecurity
     OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));

COMMENT ON VIEW core.v_rls_gaps IS
  'Jin firm-wali tables par RLS adhoori hai. Khali hona chahiye. Kuch dikhe to turant theek karo.';

-- ----------------------------------------------------------------------------
-- 3. Pahra — migration ke aakhir me aur API boot par yahi chalega
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.assert_rls_policies(p_schemas TEXT[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    bad TEXT;
BEGIN
    SELECT string_agg(schema_name || '.' || table_name || ' (' || dikkat || ')',
                      E'\n  ' ORDER BY schema_name, table_name)
      INTO bad
      FROM core.v_rls_gaps
     WHERE p_schemas IS NULL OR schema_name = ANY (p_schemas);

    IF bad IS NOT NULL THEN
        RAISE EXCEPTION E'RLS adhoori hai in tables par:\n  %', bad
          USING HINT = 'ENABLE + FORCE ROW LEVEL SECURITY aur ek policy likhiye. '
                       'Jaan-boojh kar chhoot deni hai to core.rls_exempt me wajah ke saath daaliye.';
    END IF;
END $$;

COMMENT ON FUNCTION core.assert_rls_policies IS
  'Har migration ke aakhir me chalao: SELECT core.assert_rls_policies(ARRAY[''mfg'',''trade'']); '
  'Bina argument ke poori DB check hoti hai.';

-- ----------------------------------------------------------------------------
-- 4. Aaj ki haalat — abhi FAIL nahi karayenge
--    (purani tables me jo chhed hain wo pehle dekhne hain, phir bharna hai;
--     migration yahin rok di to poora deploy atak jayega)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    n INT;
    r RECORD;
BEGIN
    SELECT count(*) INTO n FROM core.v_rls_gaps;

    IF n = 0 THEN
        RAISE NOTICE 'RLS pahra: sab theek hai — koi firm-wali table bina policy ke nahi ✓';
    ELSE
        RAISE WARNING '⚠️  RLS pahra: % table par kami mili —', n;
        FOR r IN SELECT schema_name, table_name, dikkat
                   FROM core.v_rls_gaps
                  ORDER BY schema_name, table_name
        LOOP
            RAISE WARNING '    %.%  →  %', r.schema_name, r.table_name, r.dikkat;
        END LOOP;
        RAISE WARNING '    Inhe theek karke phir: SELECT core.assert_rls_policies();';
    END IF;
END $$;

SELECT 'RLS pahra tayyar ✓' AS status;
