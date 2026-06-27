-- ============================================================================
-- 52 — User WhatsApp number (admin/partner logins).
-- Add Firm form me Mobile No (phone) + WhatsApp No alag-alag. Nullable.
-- ============================================================================
ALTER TABLE core.users ADD COLUMN IF NOT EXISTS whatsapp TEXT;

SELECT 'whatsapp column added to core.users ✓' AS status;
