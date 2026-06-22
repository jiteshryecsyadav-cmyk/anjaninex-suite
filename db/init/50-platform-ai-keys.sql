-- ============================================================================
-- Migration 50 — Platform AI Keys (Anjaninex super-admin, common for ALL firms)
-- Super-admin yahan Gemini / Claude / OpenAI API keys EK BAAR set karta hai.
-- Saari firms ke bill + order scan inhi platform keys se chalte hain (default).
-- Firm apni BYOK key daale to wo override karti hai (firm.api_keys).
-- Same single-row table platform.billing_settings (id = 1) me 3 naye columns.
-- Idempotent — baar-baar chal sakti hai.
-- ============================================================================

BEGIN;

ALTER TABLE platform.billing_settings
    ADD COLUMN IF NOT EXISTS ai_gemini_key  TEXT,
    ADD COLUMN IF NOT EXISTS ai_claude_key  TEXT,
    ADD COLUMN IF NOT EXISTS ai_openai_key  TEXT;

COMMIT;

SELECT 'migration 50-platform-ai-keys complete ✓' AS status;
