-- ============================================================================
-- Migration 38 — Service Usage Log
-- ----------------------------------------------------------------------------
-- Jab firm koi extra service use karti hai (bill scan, SMS, WhatsApp, PDF, ...)
-- to har use yahan log hota hai + wallet se charge katta hai (agar mode
-- 'anjaninex' ho). mode 'self' = firm khud direct le rahi → amount 0 (sirf count).
-- Isi se "Usage Report" banta hai (kitna use kiya, kitna kata).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS platform.service_usage (
    id          BIGSERIAL PRIMARY KEY,
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,                 -- 'bill_scan', 'sms', 'whatsapp', ...
    name        TEXT,                          -- snapshot of service name
    units       NUMERIC(12,2) NOT NULL DEFAULT 1,
    rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,   -- units*rate (0 if self mode)
    mode        TEXT NOT NULL DEFAULT 'anjaninex',  -- 'anjaninex' | 'self'
    reference   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_service_usage_firm     ON platform.service_usage(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_service_usage_firm_code ON platform.service_usage(firm_id, code);

COMMIT;

SELECT 'migration 38-service-usage complete' AS status;
