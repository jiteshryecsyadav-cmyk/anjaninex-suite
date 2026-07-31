-- ============================================================================
-- 111: WhatsApp OTP ab TEMPLATE se (Meta ka niyam)
-- ============================================================================
-- Meta free-form text tabhi bhejne deta hai jab grahak ne pehle message kiya ho
-- (24-ghante ki "session window"). OTP to sabse pehla message hota hai — isliye
-- uske liye APPROVED TEMPLATE (category: AUTHENTICATION) zaroori hai.
-- Template approve hote hi bas ye 3 khaane bhar do — code apne aap template bhejega.

ALTER TABLE platform.wa_provider_settings
  ADD COLUMN IF NOT EXISTS otp_template_name  TEXT,                    -- jaise 'vyapaar_setu_otp'
  ADD COLUMN IF NOT EXISTS otp_template_lang  TEXT DEFAULT 'en',       -- 'en' / 'en_US' / 'hi'
  ADD COLUMN IF NOT EXISTS otp_template_button BOOLEAN DEFAULT true;   -- copy-code button hai?

SELECT 'wa otp template fields ready ✓' AS status;
