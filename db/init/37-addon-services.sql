-- ============================================================================
-- Migration 37 — Add-on / Extra Services (Anjaninex Admin-managed)
-- ----------------------------------------------------------------------------
-- Anjaninex super-admin extra services ka catalog manage karta hai (rate set,
-- add / edit / delete). Har firm checkbox se choose karti hai ki kaunsi service
-- use karegi (firm_addon_services). Charge wallet se katega.
--
--   platform.addon_services       -> admin catalog (master list + rates)
--   platform.firm_addon_services  -> har firm ki chosen services (on/off)
-- ============================================================================

BEGIN;

-- ── Admin catalog ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform.addon_services (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT UNIQUE NOT NULL,          -- stable key: 'bill_scan', 'sms', ...
    name          TEXT NOT NULL,                 -- 'Bill Scan'
    icon          TEXT,                          -- emoji '🤖'
    unit          TEXT,                          -- 'scan', 'SMS', 'msg', 'GB / mo'
    rate          NUMERIC(12,2) NOT NULL DEFAULT 0,   -- ₹ per unit (admin decides)
    free_note     TEXT,                          -- 'First 50/mo FREE on Starter+'
    billing_type  TEXT NOT NULL DEFAULT 'per_use',    -- 'per_use' | 'monthly'
    active        BOOLEAN NOT NULL DEFAULT TRUE,      -- list me dikhe ya nahi
    allow_self    BOOLEAN NOT NULL DEFAULT TRUE,      -- firm khud direct le sakti hai (BYOK)?
    sort_order    INT NOT NULL DEFAULT 100,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Firm selections (kaunsi service firm ne ON ki) ─────────────────────────
-- mode = 'anjaninex' -> Anjaninex se le rahe hain, wallet se rate ke hisab se charge
--        'self'      -> firm khud direct (apne keys/account) — Anjaninex sirf integrate
--                       karega, koi wallet charge nahi. self_note me apni detail.
CREATE TABLE IF NOT EXISTS platform.firm_addon_services (
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    service_id  UUID NOT NULL REFERENCES platform.addon_services(id) ON DELETE CASCADE,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    mode        TEXT NOT NULL DEFAULT 'anjaninex',  -- 'anjaninex' | 'self'
    self_note   TEXT,                               -- own provider / key reference (self mode)
    enabled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (firm_id, service_id)
);

CREATE INDEX IF NOT EXISTS ix_firm_addon_firm ON platform.firm_addon_services(firm_id);

-- ── Seed default services (jo abhi UI me hardcoded the) ────────────────────
INSERT INTO platform.addon_services (code, name, icon, unit, rate, free_note, billing_type, sort_order) VALUES
    ('bill_scan',  'Bill Scan',            '🤖', 'scan',    0.25, 'First 50/mo FREE on Starter+', 'per_use', 10),
    ('sms',        'SMS (Transactional)',  '📱', 'SMS',     0.15, 'Login OTP, alerts, reminders', 'per_use', 20),
    ('whatsapp',   'WhatsApp Message',     '💬', 'msg',     0.85, 'Bill share, GR alerts',        'per_use', 30),
    ('voice_otp',  'Voice OTP',            '📞', 'call',    0.45, 'Fallback when SMS fails',      'per_use', 40),
    ('email',      'Email (Transactional)','📧', 'email',   0.05, 'FREE up to 10K, then charged', 'per_use', 50),
    ('storage',    'Extra Storage',        '💾', 'GB / mo', 50.00,'Beyond plan limit',            'monthly', 60),
    ('pdf',        'PDF Generation',       '📄', 'PDF',     0.10, 'Bills, payslips, reports',     'per_use', 70),
    ('einvoice',   'E-invoice IRN',        '🔐', 'IRN',     0.50, 'Govt portal API',              'per_use', 80)
ON CONFLICT (code) DO NOTHING;

COMMIT;

SELECT 'migration 37-addon-services complete' AS status;
