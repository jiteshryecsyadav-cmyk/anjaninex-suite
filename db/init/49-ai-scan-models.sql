-- ============================================================================
-- Migration 49: Per-model AI bill-scan services (Flash / Pro / Sonnet / Haiku / GPT-4o)
-- ----------------------------------------------------------------------------
-- Har AI model ki apni rate. Charge = AI ki asli cost + 10% margin + 18% GST.
-- Rate admin-editable hai (Admin -> Addon Services se rate/margin badal sakte ho).
-- BillExtractorService scan ke time `bill_scan_{model}` code charge karta hai
-- (platform key par; BYOK firm ka kharcha unke apne account par => wallet 0).
--
-- Rate calc (₹/scan): asli_cost * 1.10 (margin) * 1.18 (GST)
--   flash  : 0.30 * 1.10 * 1.18 = 0.39
--   haiku  : 0.70 * 1.10 * 1.18 = 0.91
--   pro    : 1.20 * 1.10 * 1.18 = 1.56
--   gpt4o  : 1.40 * 1.10 * 1.18 = 1.82
--   sonnet : 2.00 * 1.10 * 1.18 = 2.60
-- (ye sirf seed/default hain — admin jab chahe badal sakta hai)
-- ============================================================================

INSERT INTO platform.addon_services (code, name, icon, unit, rate, free_note, billing_type, allow_self, active, sort_order) VALUES
    ('bill_scan_flash',  'Bill Scan — Gemini Flash', '⚡', 'scan', 0.39, 'Fast & sasta',        'per_use', TRUE, TRUE, 11),
    ('bill_scan_haiku',  'Bill Scan — Claude Haiku', '🌿', 'scan', 0.91, 'Medium',              'per_use', TRUE, TRUE, 12),
    ('bill_scan_pro',    'Bill Scan — Gemini Pro',   '🎯', 'scan', 1.56, 'Accurate',            'per_use', TRUE, TRUE, 13),
    ('bill_scan_gpt4o',  'Bill Scan — GPT-4o',       '🤖', 'scan', 1.82, 'Accurate (OpenAI)',   'per_use', TRUE, TRUE, 14),
    ('bill_scan_sonnet', 'Bill Scan — Claude Sonnet','⭐', 'scan', 2.60, 'Best accuracy',        'per_use', TRUE, TRUE, 15)
ON CONFLICT (code) DO NOTHING;

SELECT 'Per-model AI scan services seeded ✓' AS status;
