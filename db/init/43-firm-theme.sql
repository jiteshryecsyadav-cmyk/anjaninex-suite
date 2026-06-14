-- ============================================================================
-- Migration 43 — Per-firm UI Theme Color
-- ----------------------------------------------------------------------------
-- Har firm ka ek fixed UI theme color hota hai jo SIRF Anjaninex super-admin
-- set karta hai. Normal users ise change nahi kar sakte (user-facing picker
-- hata diya). Frontend /api/me/modules se firmTheme padh kar apply karta hai.
-- Allowed values: classic | theme-sunset | theme-aurora | theme-neon |
--                 theme-violet | theme-gold. Default 'classic'.
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS theme VARCHAR(40) DEFAULT 'classic';

SELECT 'migration 43-firm-theme complete' AS status;
