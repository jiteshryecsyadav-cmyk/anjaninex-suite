-- ============================================================================
-- Migration 52: Sarvam Vision bill-scan service (OCR + AI hybrid — "option B")
-- ----------------------------------------------------------------------------
-- Sarvam Document Intelligence (doc-digitization) bill/document ko OCR karta hai
-- (Indian scripts/handwriting acche se), uska text fir Gemini Flash se structured
-- JSON me badalte hain (sasta + reliable). Isliye ise "hybrid" kehte hain.
--
-- Charge = asli cost + 10% margin + 18% GST (admin-editable, Addon Services se).
--   Sarvam doc-digitization abhi (Feb 2026 tak) FREE hai → sirf Gemini Flash
--   structuring ka chhota cost (~0.30) → 0.30 * 1.10 * 1.18 = 0.39 /scan.
--   (Feb 2026 ke baad Sarvam paid hoga to admin yahin rate badal de.)
-- BillExtractorService scan ke time `bill_scan_sarvam` code charge karta hai
-- (platform key par). Sarvam key Platform AI Keys page (ai_sarvam_key) se aati hai.
-- ============================================================================

INSERT INTO platform.addon_services (code, name, icon, unit, rate, free_note, billing_type, allow_self, active, sort_order) VALUES
    ('bill_scan_sarvam', 'Bill Scan — Sarvam Vision (OCR+AI)', '🟠', 'scan', 0.39, 'Indian bills · OCR hybrid', 'per_use', TRUE, TRUE, 16)
ON CONFLICT (code) DO NOTHING;

SELECT 'Sarvam Vision scan service seeded ✓' AS status;
