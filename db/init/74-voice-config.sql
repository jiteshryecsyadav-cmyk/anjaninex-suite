-- 74: Voice bridge central config — Sarvam + Gemini keys + bridge domain.
-- Anjaninex super-admin ye keys admin panel (Voice Agents page) se paste karta hai.
-- Bridge inhe DB se padhta hai (env fallback). Ye CENTRAL keys hain (sab firms share).
-- Plaintext store (platform ki apni keys, DB access-controlled; bridge Python isse seedha padhta).

CREATE TABLE IF NOT EXISTS platform.voice_config (
    id             int PRIMARY KEY DEFAULT 1,
    sarvam_key     text,
    gemini_key     text,
    bridge_domain  text DEFAULT 'voice.anjaninex.com',
    updated_at     timestamptz DEFAULT now(),
    CONSTRAINT voice_config_single CHECK (id = 1)
);
INSERT INTO platform.voice_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
    GRANT SELECT, INSERT, UPDATE ON platform.voice_config TO namokara_app;
  END IF;
END $$;
