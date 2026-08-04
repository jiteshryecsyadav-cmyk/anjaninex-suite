-- ============================================================================
-- 116: MANUFACTURER — schema + masters
-- ============================================================================
-- Vyapaar Setu ab chaar tarah ki firm sambhalega:
--   agency       maal khareedti hai, aage bechti hai   (jo abhi chal raha hai)
--   manufacturer maal BANATA hai, agency ko bechta hai (naya)
--   transport    maal dhota hai
--   buyer        agency se khareedta hai
--
-- Chaaron ka APP alag hoga — alag URL, alag build, alag APK, alag sidebar,
-- alag daam. Par DB EK hi hai, do wajah se:
--   1. Ek hi document chaaron haathon se guzarta hai. Do DB hote to har haath
--      par ek copy banti aur har copy ka apna sach hota — wahi milaan ka
--      jhagda jo aaj WhatsApp par hai.
--   2. Credil (70-credil.sql) ek network dataset hai jo seedha trading.bills
--      par JOIN maarti hai. Postgres me ek DB se doosri par JOIN lagta hi
--      nahi — alag DB me manufacturer Credil me dikhta hi nahi.
--
-- Ye file sirf DHAANCHA banati hai: firm ka type, mfg schema, aur wo teen
-- masters jinke bina koi document ban hi nahi sakta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Firm ab batayegi ki wo KARTI kya hai
--
-- ⚠️ `firm_type` NAAM ISTEMAL NAHI KIYA — wo column migration 50 se pehle se
-- hai aur usme KANOONI DHAANCHA bharaa hai (proprietorship / partnership /
-- llp / pvt_ltd). Usi naam par CHECK lagate to purani saari rows par
-- constraint fail hoti aur deploy wahin ruk jata.
--
-- Isliye naya column: business_kind = firm ka DHANDHA kya hai.
-- Do alag baatein hain aur dono chahiye:
--   firm_type     = kanooni dhaancha (Pvt Ltd hai ya proprietorship)
--   business_kind = kaam kya karti hai (banati hai ya bechti hai)
-- ----------------------------------------------------------------------------
ALTER TABLE platform.firms
  ADD COLUMN IF NOT EXISTS business_kind TEXT NOT NULL DEFAULT 'agency';

-- CHECK alag se — ADD COLUMN ... CHECK dobara chalane par girta hai
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firms_business_kind_chk') THEN
    ALTER TABLE platform.firms
      ADD CONSTRAINT firms_business_kind_chk
      CHECK (business_kind IN ('agency','manufacturer','transport','buyer','both'));
  END IF;
END $$;

COMMENT ON COLUMN platform.firms.business_kind IS
  'Firm ka dhandha: agency (khareed-bech) / manufacturer (banati hai) / '
  'transport (dhoti hai) / buyer (khareedti hai) / both. Login ke baad isi se '
  'tay hota hai ki kaunsa app kholna hai. NOTE: firm_type se alag hai — wo '
  'kanooni dhaancha hai (proprietorship/pvt_ltd).';

CREATE INDEX IF NOT EXISTS firms_business_kind_ix ON platform.firms (business_kind);

-- ----------------------------------------------------------------------------
-- 2. Module — feature flag aur permission dono isi par tikte hain
-- ----------------------------------------------------------------------------
INSERT INTO core.modules (code, name, icon, sort_order) VALUES
  ('manufacturer', 'Manufacturer', 'factory', 11)
ON CONFLICT (code) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS mfg;

-- ----------------------------------------------------------------------------
-- 3. AGENT — do bilkul alag kaam ke, isliye ek jhanda
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.agents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    agency_name TEXT,
    mobile      TEXT NOT NULL,
    -- TRUE  = karigar dilwane wala  → job slip / karigar ke khaane me dikhe
    -- FALSE = grahak laane wala     → order / challan / invoice me dikhe
    -- Dono ek hi list me mila diye to job slip par galat aadmi ka commission
    -- chadh jata tha.
    is_karigar_agent BOOLEAN NOT NULL DEFAULT FALSE,
    state TEXT, city TEXT, address TEXT, pincode TEXT,
    gstin TEXT, gst_type TEXT, pan TEXT,
    photo_url   TEXT,
    -- Apni online dukan me ye agent kya-kya dekh sake
    visibility  TEXT NOT NULL DEFAULT 'all'
                CHECK (visibility IN ('all','selected','no_rate','none')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agents_firm_mobile_uq
    ON mfg.agents (firm_id, mobile);
CREATE INDEX IF NOT EXISTS agents_firm_kind_ix
    ON mfg.agents (firm_id, is_karigar_agent) WHERE is_active;

-- ----------------------------------------------------------------------------
-- 4. KARIGAR — jo hamara maal banata hai
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.karigars (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    firm_name   TEXT,
    mobile      TEXT NOT NULL,
    job_type    TEXT NOT NULL,          -- Cutting / Silai / Finishing / Rangai …
    agent_id    UUID REFERENCES mfg.agents(id) ON DELETE SET NULL,
    state TEXT, city TEXT, address TEXT, pincode TEXT,
    gstin TEXT, gst_type TEXT, pan TEXT,
    photo_url   TEXT,
    -- Aadmi chhod ke jaye to row mat mitao — ye tick hatao. Uske banaye
    -- job slip aur majoori ka hisab salaamat rehna chahiye.
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Ek mobile par ek hi karigar. Iske bina "Chintan" aur "Chintan Bhai" do alag
-- aadmi ban jaate the aur majoori ka khata do jagah bat jata tha.
CREATE UNIQUE INDEX IF NOT EXISTS karigars_firm_mobile_uq
    ON mfg.karigars (firm_id, mobile);
CREATE INDEX IF NOT EXISTS karigars_firm_active_ix
    ON mfg.karigars (firm_id) WHERE is_active;

-- ----------------------------------------------------------------------------
-- 5. GODOWN / OFFICE — jagah ke bina stock ka koi matlab nahi
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.godowns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    mobile      TEXT NOT NULL,
    state TEXT, city TEXT, address TEXT, pincode TEXT,
    photo_url   TEXT,
    -- Nayi entry me yahi jagah pehle se chuni aayegi
    is_main     BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Ek naam ki do jagah ban gayi to stock kis me hai — kabhi pata nahi chalega
CREATE UNIQUE INDEX IF NOT EXISTS godowns_firm_name_uq
    ON mfg.godowns (firm_id, lower(name));
-- MAIN sirf EK ho sakti hai
CREATE UNIQUE INDEX IF NOT EXISTS godowns_one_main_uq
    ON mfg.godowns (firm_id) WHERE is_main;

-- ----------------------------------------------------------------------------
-- 6. SIZE aur COLOUR ki master list
--    Har jagah type karte to "Firozi" aur "FIROZI" alag ban jaate
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.sizes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INT DEFAULT 100
);
CREATE UNIQUE INDEX IF NOT EXISTS sizes_firm_name_uq ON mfg.sizes (firm_id, lower(name));

CREATE TABLE IF NOT EXISTS mfg.colours (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    hex        TEXT,
    sort_order INT DEFAULT 100
);
CREATE UNIQUE INDEX IF NOT EXISTS colours_firm_name_uq ON mfg.colours (firm_id, lower(name));

-- ----------------------------------------------------------------------------
-- 7. PARTY — yahan JAAN-BOOJH KAR kuch nahi joda
--
-- Pehle yahan 8 naye column jodne wala block tha (discount_pct, bill_due_days,
-- transport_name, udyam_type, udyam_no…). Jaanch me pata chala ki ye sab
-- PEHLE SE hain, bas naam alag hai:
--
--   discount_pct    →  trading.party_profiles.discount_normal
--                      (aur discount_exhibition / discount_special bhi)
--   bill_due_days   →  trading.party_profiles.credit_days
--   transport_name  →  trading.party_profiles.default_transporter_id
--                      → core.transporters (uska poora record wahan hai)
--   udyam_type      →  core.contacts.msme_type
--   udyam_no        →  core.contacts.udyam_no
--
-- Dobara jodte to ek hi baat do jagah likhi jaati — aur ek din ek jagah
-- badalti, doosri nahi. Wahi "bill par 10% lagta hai par master me 8% likha
-- hai" wali dikkat banti. Manufacturer app inhi maujooda column se padhega.
--
-- (Party ki table ka naam bhi `trading.parties` nahi, `trading.party_profiles`
--  hai — pehle galat likha tha aur migration wahin ruk gayi thi.)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 8. RLS — har nayi table par, bina chhode
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agents','karigars','godowns','sizes','colours'] LOOP
    EXECUTE format('ALTER TABLE mfg.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE mfg.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON mfg.%I', t || '_firm_iso', t);
    EXECUTE format(
      'CREATE POLICY %I ON mfg.%I
         USING (firm_id = core.current_firm_id())
         WITH CHECK (firm_id = core.current_firm_id())', t || '_firm_iso', t);
  END LOOP;
END $$;

-- Pahra (115 se) — is file ne jo banaya uspar policy hai ya nahi
SELECT core.assert_rls_policies(ARRAY['mfg']);

SELECT 'manufacturer masters tayyar ✓' AS status;
