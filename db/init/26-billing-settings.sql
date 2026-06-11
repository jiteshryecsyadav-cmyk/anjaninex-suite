-- ============================================================================
-- Migration 26 — Platform Billing Settings (Anjaninex Admin)
-- Super-admin yahan apna UPI / Bank / QR daalta hai jisse firms subscription
-- payment karein. Razorpay keys baad ke liye (abhi optional).
-- Single-row table (id = 1).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS platform.billing_settings (
    id                   SMALLINT PRIMARY KEY DEFAULT 1,
    payee_name           TEXT,
    upi_id               TEXT,
    bank_name            TEXT,
    account_name         TEXT,
    account_no           TEXT,
    ifsc                 TEXT,
    qr_image_url         TEXT,
    instructions         TEXT,
    gateway              TEXT,            -- 'razorpay' (future)
    razorpay_key_id      TEXT,
    razorpay_key_secret  TEXT,
    gateway_enabled      BOOLEAN DEFAULT FALSE,
    updated_at           TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT billing_singleton CHECK (id = 1)
);

INSERT INTO platform.billing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT 'migration 26-billing-settings complete' AS status;
