-- ============================================================================
-- 95: Firm Field Settings — har firm apni screen ke fields khud tay kare
-- ============================================================================
-- DIKKAT:
--   Har firm ki apni zarurat hai. Kisi ko "Incentive %" chahiye, kisi ko nahi.
--   Koi "Sub Agent" ko "Dalal" bolta hai. Abhi ye sab code me hard-coded hai,
--   isliye har chhoti farmaish par code + deploy + 7 firms me test karna padta
--   hai. Client ko 2-3 din intezaar, aur aapko har baar wahi kaam.
--
-- ILAAJ:
--   Har field ka catalog code me (registry) rehta hai — key, label, type,
--   default. Yahan sirf us firm ka BADLAAV rakha jata hai:
--       visible / required / label
--   NULL = registry ka default chalega. Row hai hi nahi = default chalega.
--
--   field_key = '*'  →  POORI SCREEN ka on/off (Master menu se hi gayab)
--
-- FAYDA:
--   Naya field jodna = registry me ek line. Uska tick har firm ke Settings
--   page me apne aap aa jayega — is table ko chhedna nahi padega.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform.firm_field_settings (
    firm_id     uuid NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    screen      text NOT NULL,      -- 'group_master', 'party_master', 'bill', ...
    field_key   text NOT NULL,      -- '*' = poori screen
    visible     boolean,            -- NULL = registry ka default
    required    boolean,            -- NULL = registry ka default
    label       text,               -- NULL = registry ka naam
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid,
    PRIMARY KEY (firm_id, screen, field_key)
);

CREATE INDEX IF NOT EXISTS idx_firm_field_settings_firm
    ON platform.firm_field_settings (firm_id, screen);

-- ---------------------------------------------------------------------------
-- RLS — ek firm doosri firm ki settings na dekhe (CLAUDE.md rule #1)
-- ---------------------------------------------------------------------------
ALTER TABLE platform.firm_field_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firm_isolation_firm_field_settings ON platform.firm_field_settings;
CREATE POLICY firm_isolation_firm_field_settings ON platform.firm_field_settings
    USING       (firm_id = core.current_firm_id()
                 OR current_setting('app.is_platform_admin', true) = 'true')
    WITH CHECK  (firm_id = core.current_firm_id()
                 OR current_setting('app.is_platform_admin', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON platform.firm_field_settings TO namokara_app;

-- ---------------------------------------------------------------------------
-- Permission — firm owner khud apni screens set kar sake (CLAUDE.md rule #4).
-- Ye jaan-boojh kar EDIT-only hai: dekhne ke liye alag permission ki zarurat
-- nahi, kyunki settings har user ke app me apne aap lagti hain.
-- ---------------------------------------------------------------------------
INSERT INTO core.permissions (code, module, resource, action, scope, description) VALUES
('settings.fields.edit.firm', 'settings', 'fields', 'edit', 'firm', 'Screen ke fields on/off karna')
ON CONFLICT (code) DO NOTHING;

-- Purane roles ko ye nayi permission apne aap nahi milti (wo ek baar seed hui thi) —
-- isliye yahan seedha jod rahe hain.
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r, core.permissions p
WHERE p.code = 'settings.fields.edit.firm'
  AND r.code IN ('super_admin', 'firm_owner', 'firm_admin')
ON CONFLICT DO NOTHING;

SELECT 'firm_field_settings + settings.fields.edit.firm ready ✓' AS status;
