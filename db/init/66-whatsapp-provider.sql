-- 66: WhatsApp provider (wabanow BSP) - central Anjaninex key + per-firm number mapping.
-- Model: ek central API key (Anjaninex), har firm ka apna WABA number (subdomain jaisa isolation).

-- Central provider config (single row, id = 1). Super-admin only.
CREATE TABLE IF NOT EXISTS platform.wa_provider_settings (
    id          int PRIMARY KEY DEFAULT 1,
    provider    text DEFAULT 'wabanow',
    base_url    text,              -- e.g. https://wabanow.com/api
    api_key     text,              -- central Anjaninex API key (server-side only)
    enabled     boolean DEFAULT false,
    updated_at  timestamptz DEFAULT now(),
    CONSTRAINT wa_provider_single CHECK (id = 1)
);
INSERT INTO platform.wa_provider_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Per-firm WhatsApp number (WABA) mapping. Bhejte waqt: central key + firm ka phone_number_id.
CREATE TABLE IF NOT EXISTS platform.firm_whatsapp (
    firm_id          uuid PRIMARY KEY,
    waba_number      text,          -- e.g. 919511540583
    phone_number_id  text,          -- wabanow/Meta Phone Number ID
    waba_account_id  text,          -- WABA Account ID
    business_id      text,
    display_name     text,
    status           text DEFAULT 'active',
    enabled          boolean DEFAULT true,
    updated_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_firm_whatsapp_number ON platform.firm_whatsapp(waba_number);
