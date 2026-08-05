-- ============================================================================
-- 127: RLS ke jo 31 chhed the, wo band
-- ============================================================================
-- Migration 115 ka guard (core.v_rls_gaps) 31 table pakad raha tha jinpar
-- Row-Level Security adhoori thi. Do kism ki dikkat:
--
--   A) RLS ENABLE hi nahi — table SAB firms ko dikh rahi thi. Ye asli chhed hai.
--   B) FORCE nahi — table ka maalik (postgres) RLS bypass kar sakta hai.
--      App `namokara_app` se judti hai (maalik nahi), isliye rozmarra me asar
--      nahi tha. Par migration/maintenance postgres se chalti hai — tab bypass
--      ho jata. Isliye ye bhi band.
--
-- ⚠️ RLS blindly ENABLE karna KHATARNAK hai: policy galat hui to query khali
--    lautne lagti hai aur chalta hua app tut jata hai. Isliye har table ka
--    asli istemaal dekh kar hi haath lagaya gaya:
--
--    · bot (WhatsApp) firm context SET karta hai  → bot/lib/db.js:21   ✓
--    · party-chat ka public rasta bhi karta hai   → PartyChatController:504 ✓
--    · voice_agents super admin padhta hai        → admin bypass se chalega ✓
--    · role_screen_permissions me firm_id NULL bhi hota hai (system roles) —
--      unhe sabko dikhna CHAHIYE, isliye NULL wala rasta khula rakha
--    · agent_commissions JAAN-BOOJH KAR chhoda — aage dekho
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Do madadgar — taaki policy ka roop har jagah ek jaisa rahe
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.rls_lagao(p_schema TEXT, p_table TEXT,
                                          p_null_chalega BOOLEAN DEFAULT FALSE)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
    pol  TEXT := p_table || '_firm_iso';
    cond TEXT;
BEGIN
    -- Super admin ko sab dikhta hai — wahi shart jo baaki policies me hai
    cond := 'firm_id = core.current_firm_id()'
            || CASE WHEN p_null_chalega THEN ' OR firm_id IS NULL' ELSE '' END
            || $q$ OR current_setting('app.is_platform_admin', true) = 'true'$q$;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
    EXECUTE format('ALTER TABLE %I.%I FORCE  ROW LEVEL SECURITY', p_schema, p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol, p_schema, p_table);
    EXECUTE format('CREATE POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                   pol, p_schema, p_table, cond, cond);
END $fn$;

COMMENT ON FUNCTION core.rls_lagao IS
  'Ek table par firm-isolation lagata hai. p_null_chalega=true tab jab firm_id '
  'NULL ka matlab "sabka saanjha" ho (jaise system roles).';

-- ----------------------------------------------------------------------------
-- 1. Jinpar RLS thi hi nahi — firm_id NOT NULL wali
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('core',     'party_groups'),
      ('platform', 'complaints'),
      ('platform', 'feature_flag_firms'),
      ('platform', 'firm_whatsapp'),
      ('platform', 'party_menu_log'),
      ('platform', 'party_chat_invites'),
      ('platform', 'party_chat_otps'),
      ('platform', 'party_chat_threads'),
      ('platform', 'voice_agents'),
      ('hr',       'location_trails_removed')
  ) AS t(s, n) LOOP
    IF to_regclass(r.s || '.' || r.n) IS NOT NULL THEN
      PERFORM core.rls_lagao(r.s, r.n, FALSE);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Jinme firm_id NULL bhi ho sakta hai
--
--    role_screen_permissions — NULL = system role, sab firms ka saanjha
--    wa.incoming / wa.orders — abhi kis firm ka hai wo tay nahi hua (bot ne
--                              number match nahi kiya). Wo kisi ka nahi hai,
--                              isliye chhupane se kuch nahi milta aur bot
--                              ruk jata.
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('core', 'role_screen_permissions'),
      ('wa',   'incoming'),
      ('wa',   'orders')
  ) AS t(s, n) LOOP
    IF to_regclass(r.s || '.' || r.n) IS NOT NULL THEN
      PERFORM core.rls_lagao(r.s, r.n, TRUE);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. audit_logs — policy aur FORCE pehle se the, sirf ENABLE reh gaya tha
--    (kisi ne aadha kaam kiya tha). Policy ko haath nahi lagaya.
-- ----------------------------------------------------------------------------
ALTER TABLE platform.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Sirf FORCE reh gaya tha — policy pehle se sahi hai, chhedni nahi
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('hr',        'holidays'),
      ('hr',        'location_trails'),
      ('hr',        'salary_structures'),
      ('hr',        'selfies'),
      ('suppliers', 'categories'),
      ('suppliers', 'photos'),
      ('suppliers', 'rates'),
      ('trading',   'commission')
  ) AS t(s, n) LOOP
    IF to_regclass(r.s || '.' || r.n) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.s, r.n);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. location_trails ke mahine-wale partition
--
--    Parent (hr.location_trails) par RLS pehle se hai, aur app hamesha parent
--    se hi query karti hai — isliye rozmarra me leak nahi tha. Par partition
--    ko SEEDHA chhuo to parent ki policy nahi lagti. Isliye har partition par
--    bhi wahi policy.
--
--    ⚠️ Partition haath se banaye jate hain (db/init/10-hr.sql me 2026_12 tak).
--       2027 ke banao to unpar bhi core.rls_lagao('hr','location_trails_2027_01')
--       chalana yaad rakhna — warna naya chhed khul jayega.
-- ----------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'hr' AND c.relname LIKE 'location\_trails\_2%'
       AND c.relkind = 'r'
  LOOP
    PERFORM core.rls_lagao('hr', r.n, FALSE);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. JAAN-BOOJH KAR chhodi hui table
--
--    platform.agent_commissions — reseller/agent ka commission. Ek agent kai
--    firms ko laata hai aur uska dashboard SAARI firms ka hisaab dikhata hai
--    (AgentService agent_id se query karta hai, firm se nahi — aur us token me
--    firm_id hota hi nahi). Firm-isolation lagate hi agent ka dashboard khali
--    ho jata.
--
--    Ye chhed nahi, dhaanche ka faisla hai — par likha hua rehna chahiye,
--    warna agli baar koi "theek" karke dashboard tod dega.
-- ----------------------------------------------------------------------------
INSERT INTO core.rls_exempt (schema_name, table_name, reason) VALUES
  ('platform', 'agent_commissions',
   'Agent ka dashboard kai firms ka hisaab ek saath dikhata hai (agent_id se '
   'query hoti hai, firm se nahi — token me firm_id hota hi nahi). Firm RLS '
   'lagate hi dashboard khali ho jayega. Suraksha agent_id par hai.')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. Ab guard chalao — kuch bacha to yahi chillayega
-- ----------------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM core.v_rls_gaps;
    RAISE NOTICE 'Ab bache hue gaps: %', n;
END $$;

SELECT * FROM core.v_rls_gaps ORDER BY schema_name, table_name;
SELECT 'rls gaps band ✓' AS status;
