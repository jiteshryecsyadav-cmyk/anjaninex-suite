-- ============================================================================
-- 113: OTP ab MOBILE (SMS) par bhi — koi bhi provider chalega
-- ============================================================================
-- WhatsApp wala rasta Meta ke approved template par atka hai. Us beech party ko
-- OTP milta hi nahi tha. Ab: pehle WhatsApp, na jaye to SMS, dono na jayein to
-- firm 🔑 se dekh kar bata de.
--
-- Kisi ek company se bandhe nahin — URL ka saancha (template) yahin rakha hai,
-- usme ye jagah apne aap bhar jati hain:
--    {key}   = api key        {otp}  = OTP ke 6 ank
--    {to10}  = 10-ank number  {to91} = 91 ke saath number
--    {msg}   = poora message (URL-encoded)
--
-- Misaal (account banne par sirf ye 2 khaane bharne hain):
--  Fast2SMS : https://www.fast2sms.com/dev/bulkV2?authorization={key}&route=otp&variables_values={otp}&numbers={to10}
--  MSG91    : https://control.msg91.com/api/v5/otp?authkey={key}&template_id=XXXX&mobile={to91}&otp={otp}

CREATE TABLE IF NOT EXISTS platform.sms_provider_settings (
    id           INTEGER PRIMARY KEY DEFAULT 1,
    provider     TEXT    DEFAULT 'custom',          -- msg91 / fast2sms / custom
    url_template TEXT,                              -- upar wala saancha
    api_key      TEXT,
    http_method  TEXT    DEFAULT 'GET',             -- GET ya POST
    body_template TEXT,                             -- POST ke liye JSON saancha (warna khali)
    msg_template TEXT    DEFAULT 'Vyapaar Setu ka OTP {otp} hai. 10 minute me expire ho jayega. Kisi ko mat batayein.',
    enabled      BOOLEAN DEFAULT false,
    updated_at   TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT sms_provider_single CHECK (id = 1)
);

INSERT INTO platform.sms_provider_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS jaan-boojh kar NAHI — OTP bhejne wala endpoint bina-login (public) hai aur
-- usme koi firm/admin context nahi hota. wa_provider_settings bhi isi tarah hai.
-- Ye table kisi API se padhi nahi jati, sirf OTP bhejte waqt server khud padhta hai.
REVOKE ALL ON platform.sms_provider_settings FROM PUBLIC;

SELECT 'sms provider settings ready ✓' AS status;
