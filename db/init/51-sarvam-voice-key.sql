-- ============================================================================
-- Migration 51 — Sarvam AI Voice Key (Anji ki natural Indian TTS)
-- Anji help-desk ki robotic browser voice (Web Speech API) ki jagah Sarvam AI
-- ki natural Indian TTS. Super-admin yahan EK BAAR Sarvam api-subscription-key
-- set karta hai (platform.billing_settings id = 1). Khali ho to Anji apne aap
-- browser voice par fallback ho jaata hai (kabhi nahi tootta).
-- Same single-row table platform.billing_settings — Gemini/Claude/OpenAI jaisa.
-- Idempotent — baar-baar chal sakti hai.
-- ============================================================================

BEGIN;

ALTER TABLE platform.billing_settings
    ADD COLUMN IF NOT EXISTS ai_sarvam_key TEXT;

COMMIT;

SELECT 'migration 51-sarvam-voice-key complete ✓' AS status;
