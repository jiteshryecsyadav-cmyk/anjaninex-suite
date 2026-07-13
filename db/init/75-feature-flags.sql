-- 75: Feature flags — naya feature pehle pilot firms (Riddhi) me, test ke baad sab ko.
-- enabled_all = true  → feature SAB firms ke liye on
-- enabled_all = false → sirf feature_flag_firms wali firms ke liye on

CREATE TABLE IF NOT EXISTS platform.feature_flags (
    key          text PRIMARY KEY,
    name         text NOT NULL,
    description  text,
    enabled_all  boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.feature_flag_firms (
    flag_key  text NOT NULL REFERENCES platform.feature_flags(key) ON DELETE CASCADE,
    firm_id   uuid NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    PRIMARY KEY (flag_key, firm_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON platform.feature_flags, platform.feature_flag_firms TO namokara_app;

-- Pehla flag: receipt ka "Paisa kisko mila" toggle — pilot Riddhi Agency
INSERT INTO platform.feature_flags (key, name, description)
VALUES ('money_to_agency', 'Receipt: Paisa kisko mila toggle', 'Broker (seedha supplier ko) vs Aadhat (agency ke cash/bank me) settlement choice')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform.feature_flag_firms (flag_key, firm_id)
SELECT 'money_to_agency', f.id FROM platform.firms f WHERE lower(f.name) LIKE '%riddhi%'
ON CONFLICT DO NOTHING;
