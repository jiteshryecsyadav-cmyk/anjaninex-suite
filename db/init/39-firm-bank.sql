-- ============================================================================
-- Migration 39 — Firm bank details (Add Firm form ke liye)
-- platform.firms me bank_name / account_no / ifsc columns add.
-- ============================================================================

BEGIN;

ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS bank_name  TEXT;
ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS account_no TEXT;
ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS ifsc       TEXT;

COMMIT;

SELECT 'migration 39-firm-bank complete' AS status;
