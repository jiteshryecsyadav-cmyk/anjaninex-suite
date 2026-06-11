-- ============================================================================
-- Migration 27 — Manual Payment Requests
-- Firm UPI/Bank pe pay karke yahan claim daale (amount + reference).
-- Anjaninex admin approve kare -> wallet recharge ho jaye.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS platform.payment_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL,
    amount        NUMERIC(14,2) NOT NULL,
    method        TEXT,                         -- upi|bank|other
    reference     TEXT,                         -- UTR / txn id
    note          TEXT,
    status        TEXT DEFAULT 'pending',       -- pending|approved|rejected
    created_by    UUID,
    created_at    TIMESTAMPTZ DEFAULT now(),
    reviewed_by   UUID,
    reviewed_at   TIMESTAMPTZ,
    review_note   TEXT
);

CREATE INDEX IF NOT EXISTS idx_payreq_firm   ON platform.payment_requests(firm_id);
CREATE INDEX IF NOT EXISTS idx_payreq_status ON platform.payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payreq_created ON platform.payment_requests(created_at);

COMMIT;

SELECT 'migration 27-payment-requests complete' AS status;
