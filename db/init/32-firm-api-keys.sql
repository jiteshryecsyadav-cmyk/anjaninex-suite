-- 32: Per-firm BYOK API keys (AI bill-scan + Maps)
-- Keys are set ONLY by Anjaninex super-admin (firm registration / firm detail).
-- Firm users only see which provider is active + a recharge/console link.

CREATE TABLE IF NOT EXISTS platform.firm_api_keys (
    firm_id      uuid PRIMARY KEY REFERENCES platform.firms(id) ON DELETE CASCADE,
    ai_provider  varchar(20)  NOT NULL DEFAULT 'gemini',  -- gemini | claude | openai
    ai_api_key   text,                                    -- provider key (set by super-admin)
    ai_model     varchar(80),                             -- optional model override
    maps_api_key text,                                    -- Google Maps key for HR live movement (optional)
    updated_by   uuid,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform.firm_api_keys IS 'BYOK: per-firm AI/Maps API keys, managed by Anjaninex admin only';
