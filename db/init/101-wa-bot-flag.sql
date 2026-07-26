-- ============================================================================
-- 101: WhatsApp Bot ab feature-flag ke peeche — Party Chat mukhya raasta hai
-- ============================================================================
-- Bot QR-session wala unofficial tareeka hai (tootta rehta hai, ban ka khatra).
-- Ab Bazaar Link ki baat-cheet Party Chat se hoti hai; bot ko flag ke peeche
-- rakha hai — abhi SAB firms ke liye ON (kuch nahi badla), aage sadmin
-- Feature Flags page se firm-wise ya sabke liye band kar sakta hai.

INSERT INTO platform.feature_flags (key, name, description, enabled_all)
VALUES ('wa_bot', 'Bazaar Link: WhatsApp QR Bot',
        'Purana WhatsApp QR-bot. Party Chat mukhya raasta hai; ye sirf jinke liye chahiye.',
        true)
ON CONFLICT (key) DO NOTHING;

SELECT 'wa_bot flag ready ✓' AS status;
