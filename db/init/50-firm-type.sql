-- ============================================================================
-- 50 — Firm type (proprietorship | partnership | llp | pvt_ltd)
-- Admin "Add Firm" form ke dropdown ke liye. Nullable; purani firms NULL rahengi.
-- ============================================================================
ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS firm_type TEXT;

SELECT 'firm_type column added to platform.firms ✓' AS status;
